use ssh2::Session;
use std::io::Read;
use std::net::TcpStream;
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use tauri::Emitter;

pub struct SshSession {
    session: Arc<Mutex<Session>>,
    channel: Arc<Mutex<ssh2::Channel>>,
    _reader_thread: Option<JoinHandle<()>>,
    running: Arc<Mutex<bool>>,
}

impl Drop for SshSession {
    fn drop(&mut self) {
        if let Ok(mut running) = self.running.lock() {
            *running = false;
        }
        if let Ok(session) = self.session.lock() {
            let _ = session.disconnect(None, "Session closed", None);
        }
    }
}

impl SshSession {
    pub fn new(
        host: &str,
        port: u16,
        username: &str,
        password: Option<&str>,
        private_key: Option<&str>,
        session_id: &str,
        app_handle: tauri::AppHandle,
    ) -> Result<Self, String> {
        let addr = format!("{}:{}", host, port);
        let tcp = TcpStream::connect(&addr)
            .map_err(|e| format!("TCP connection failed to {}: {}", addr, e))?;

        tcp.set_nonblocking(false)
            .map_err(|e| format!("Failed to set blocking mode: {}", e))?;

        let mut session = Session::new()
            .map_err(|e| format!("Failed to create SSH session: {}", e))?;

        session.set_tcp_stream(tcp);
        session.handshake()
            .map_err(|e| format!("SSH handshake failed: {}", e))?;

        // Authenticate
        if let Some(key_content) = private_key {
            // Write key to a temp file for ssh2
            let temp_dir = std::env::temp_dir();
            let key_path = temp_dir.join(format!("novaterm_ssh_key_{}", session_id));
            std::fs::write(&key_path, key_content)
                .map_err(|e| format!("Failed to write temp key: {}", e))?;

            let result = session.userauth_pubkey_file(
                username,
                None,
                &key_path,
                password,
            );

            // Clean up temp key file immediately
            let _ = std::fs::remove_file(&key_path);

            result.map_err(|e| format!("Public key auth failed: {}", e))?;
        } else if let Some(pass) = password {
            session.userauth_password(username, pass)
                .map_err(|e| format!("Password auth failed: {}", e))?;
        } else {
            return Err("No authentication method provided".to_string());
        }

        if !session.authenticated() {
            return Err("Authentication failed".to_string());
        }

        // Open a channel with PTY
        let mut channel = session.channel_session()
            .map_err(|e| format!("Failed to open channel: {}", e))?;

        channel.request_pty("xterm-256color", None, Some((80, 24, 0, 0)))
            .map_err(|e| format!("Failed to request PTY: {}", e))?;

        channel.shell()
            .map_err(|e| format!("Failed to start shell: {}", e))?;

        // Set channel to non-blocking for the reader thread
        session.set_blocking(false);

        let session = Arc::new(Mutex::new(session));
        let channel = Arc::new(Mutex::new(channel));

        let running = Arc::new(Mutex::new(true));
        let running_clone = Arc::clone(&running);
        let channel_clone = Arc::clone(&channel);
        let sid = session_id.to_string();

        let reader_thread = std::thread::spawn(move || {
            let mut buf = [0u8; 4096];
            loop {
                if let Ok(r) = running_clone.lock() {
                    if !*r {
                        break;
                    }
                }

                let result = {
                    let mut ch = match channel_clone.lock() {
                        Ok(ch) => ch,
                        Err(_) => break,
                    };

                    if ch.eof() {
                        let _ = app_handle.emit(&format!("ssh-exit-{}", sid), ());
                        break;
                    }

                    match ch.read(&mut buf) {
                        Ok(0) => None,
                        Ok(n) => {
                            let data = String::from_utf8_lossy(&buf[..n]).to_string();
                            Some(data)
                        }
                        Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                            None
                        }
                        Err(e) => {
                            let msg = format!("SSH read error: {}", e);
                            let _ = app_handle.emit(&format!("ssh-error-{}", sid), msg);
                            break;
                        }
                    }
                };

                if let Some(data) = result {
                    let _ = app_handle.emit(&format!("ssh-data-{}", sid), data);
                } else {
                    std::thread::sleep(std::time::Duration::from_millis(10));
                }
            }
        });

        Ok(SshSession {
            session,
            channel,
            _reader_thread: Some(reader_thread),
            running,
        })
    }

    pub fn write(&self, data: &[u8]) -> Result<(), String> {
        let mut channel = self.channel.lock()
            .map_err(|e| format!("Channel lock error: {}", e))?;

        // Set blocking for write
        if let Ok(session) = self.session.lock() {
            session.set_blocking(true);
        }

        use std::io::Write;
        channel.write_all(data)
            .map_err(|e| format!("SSH write error: {}", e))?;
        channel.flush()
            .map_err(|e| format!("SSH flush error: {}", e))?;

        // Set back to non-blocking for reader
        if let Ok(session) = self.session.lock() {
            session.set_blocking(false);
        }

        Ok(())
    }

    pub fn resize(&self, cols: u32, rows: u32) -> Result<(), String> {
        let mut channel = self.channel.lock()
            .map_err(|e| format!("Channel lock error: {}", e))?;

        if let Ok(session) = self.session.lock() {
            session.set_blocking(true);
        }

        channel.request_pty_size(cols, rows, None, None)
            .map_err(|e| format!("SSH resize error: {}", e))?;

        if let Ok(session) = self.session.lock() {
            session.set_blocking(false);
        }

        Ok(())
    }

    pub fn is_connected(&self) -> bool {
        if let Ok(channel) = self.channel.lock() {
            !channel.eof()
        } else {
            false
        }
    }
}

/// Test SSH connection without keeping it open
pub fn test_ssh_connection(
    host: &str,
    port: u16,
    username: &str,
    password: Option<&str>,
    private_key: Option<&str>,
) -> Result<String, String> {
    let addr = format!("{}:{}", host, port);

    let tcp = TcpStream::connect_timeout(
        &addr.parse().map_err(|e| format!("Invalid address: {}", e))?,
        std::time::Duration::from_secs(10),
    ).map_err(|e| format!("Connection failed: {}", e))?;

    let mut session = Session::new()
        .map_err(|e| format!("Session creation failed: {}", e))?;

    session.set_tcp_stream(tcp);
    session.set_timeout(10000);
    session.handshake()
        .map_err(|e| format!("Handshake failed: {}", e))?;

    if let Some(key_content) = private_key {
        let temp_dir = std::env::temp_dir();
        let key_path = temp_dir.join("novaterm_ssh_test_key");
        std::fs::write(&key_path, key_content)
            .map_err(|e| format!("Failed to write temp key: {}", e))?;

        let result = session.userauth_pubkey_file(username, None, &key_path, password);
        let _ = std::fs::remove_file(&key_path);
        result.map_err(|e| format!("Key auth failed: {}", e))?;
    } else if let Some(pass) = password {
        session.userauth_password(username, pass)
            .map_err(|e| format!("Password auth failed: {}", e))?;
    } else {
        return Err("No authentication method provided".to_string());
    }

    if session.authenticated() {
        let _ = session.disconnect(None, "Test complete", None);
        Ok("Connection successful".to_string())
    } else {
        Err("Authentication failed".to_string())
    }
}
