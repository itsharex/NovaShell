use ssh2::Session;
use std::io::Read;
use std::net::TcpStream;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Condvar, Mutex};
use std::sync::mpsc;
use std::thread::JoinHandle;
use std::time::{Duration, Instant};
use tauri::Emitter;

/// Securely delete a file by overwriting with zeros before removing.
/// Prevents forensic recovery of sensitive data like SSH private keys.
pub fn secure_delete(path: &std::path::Path) {
    if let Ok(meta) = std::fs::metadata(path) {
        let zeros = vec![0u8; meta.len() as usize];
        let _ = std::fs::write(path, &zeros);
    }
    let _ = std::fs::remove_file(path);
}

/// Normalize private key content for libssh2.
///
/// libssh2 is strict about key format: CRLF line endings, missing trailing
/// newline, or leading/trailing whitespace all cause the opaque error
/// `public key auth:[session(-1)] unknown error`. When users paste a key
/// into a textarea on Windows, or load one via drag-and-drop, any of those
/// can happen silently.
///
/// This helper:
///   1. Detects PPK (PuTTY) format and returns a clear error — libssh2
///      cannot read .ppk files directly.
///   2. Normalizes `\r\n` and bare `\r` line endings to `\n`.
///   3. Trims leading/trailing whitespace and re-adds a single trailing `\n`.
///   4. Verifies the content starts with a PEM/OpenSSH header.
pub fn prepare_private_key(key_content: &str) -> Result<Vec<u8>, String> {
    let trimmed = key_content.trim();

    if trimmed.is_empty() {
        return Err("Private key is empty".to_string());
    }

    // PPK (PuTTY) keys are not supported by libssh2. Tell the user how to fix.
    if trimmed.starts_with("PuTTY-User-Key-File-") {
        return Err(
            "PPK (PuTTY) keys are not supported. Convert to OpenSSH format: \
             open the key in PuTTYgen → Conversions → Export OpenSSH key."
                .to_string(),
        );
    }

    // Validate header — must be a recognizable PEM/OpenSSH private key.
    if !trimmed.starts_with("-----BEGIN") {
        return Err(
            "Invalid private key format: expected a PEM block starting with \
             '-----BEGIN ... PRIVATE KEY-----'. If you pasted a public key \
             (id_rsa.pub), paste the matching private key instead."
                .to_string(),
        );
    }

    // Normalize line endings: CRLF → LF, lone CR → LF. Ensure single trailing LF.
    let mut normalized = trimmed.replace("\r\n", "\n").replace('\r', "\n");
    normalized.push('\n');

    Ok(normalized.into_bytes())
}

/// Configure preferred algorithms on an SSH session for maximum server compatibility.
/// Must be called BEFORE session.handshake().
pub fn configure_ssh_algorithms(session: &Session) {
    // Key exchange — broad range: modern elliptic-curve + legacy DH groups
    let _ = session.method_pref(
        ssh2::MethodType::Kex,
        "ecdh-sha2-nistp256,ecdh-sha2-nistp384,ecdh-sha2-nistp521,\
         diffie-hellman-group-exchange-sha256,diffie-hellman-group14-sha256,\
         diffie-hellman-group16-sha512,diffie-hellman-group18-sha512,\
         diffie-hellman-group14-sha1,diffie-hellman-group-exchange-sha1,\
         diffie-hellman-group1-sha1",
    );
    // Host key types
    let _ = session.method_pref(
        ssh2::MethodType::HostKey,
        "ssh-ed25519,ecdsa-sha2-nistp256,ecdsa-sha2-nistp384,ecdsa-sha2-nistp521,\
         rsa-sha2-512,rsa-sha2-256,ssh-rsa",
    );
    // Ciphers (client → server)
    let _ = session.method_pref(
        ssh2::MethodType::CryptCs,
        "aes256-ctr,aes192-ctr,aes128-ctr,aes256-cbc,aes192-cbc,aes128-cbc,3des-cbc",
    );
    // Ciphers (server → client)
    let _ = session.method_pref(
        ssh2::MethodType::CryptSc,
        "aes256-ctr,aes192-ctr,aes128-ctr,aes256-cbc,aes192-cbc,aes128-cbc,3des-cbc",
    );
    // MAC (client → server)
    let _ = session.method_pref(
        ssh2::MethodType::MacCs,
        "hmac-sha2-256,hmac-sha2-512,hmac-sha1",
    );
    // MAC (server → client)
    let _ = session.method_pref(
        ssh2::MethodType::MacSc,
        "hmac-sha2-256,hmac-sha2-512,hmac-sha1",
    );
}

pub struct SshSession {
    session: Arc<Mutex<Session>>,
    channel: Arc<Mutex<ssh2::Channel>>,
    _reader_thread: Option<JoinHandle<()>>,
    _flusher_thread: Option<JoinHandle<()>>,
    running: Arc<AtomicBool>,
    write_tx: mpsc::SyncSender<Vec<u8>>,
    /// Rolling scrollback buffer (last 64KB) for restoring terminal on re-open
    scrollback: Arc<Mutex<String>>,
}

impl Drop for SshSession {
    fn drop(&mut self) {
        self.running.store(false, Ordering::SeqCst);
        // Join flusher first (exits quickly)
        if let Some(handle) = self._flusher_thread.take() {
            let _ = handle.join();
        }
        // Join reader thread (exits after session timeout ~100ms)
        if let Some(handle) = self._reader_thread.take() {
            let _ = handle.join();
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

        use std::net::ToSocketAddrs;
        let socket_addr = addr
            .to_socket_addrs()
            .map_err(|e| format!("Cannot resolve {}: {}", addr, e))?
            .next()
            .ok_or_else(|| format!("Could not resolve host: {}", host))?;

        let tcp = TcpStream::connect_timeout(
            &socket_addr,
            std::time::Duration::from_secs(15),
        ).map_err(|e| format!("TCP connection failed to {}: {}", addr, e))?;

        // Enable TCP keepalive to detect stale connections
        tcp.set_nodelay(true)
            .map_err(|e| format!("Failed to set TCP_NODELAY: {}", e))?;
        tcp.set_read_timeout(Some(std::time::Duration::from_secs(30)))
            .map_err(|e| format!("Failed to set read timeout: {}", e))?;

        // Enable OS-level TCP keepalive to survive NAT/firewall idle timeouts
        let socket = socket2::SockRef::from(&tcp);
        let keepalive = socket2::TcpKeepalive::new()
            .with_time(std::time::Duration::from_secs(15))
            .with_interval(std::time::Duration::from_secs(5));
        let _ = socket.set_tcp_keepalive(&keepalive);

        let mut session = Session::new()
            .map_err(|e| format!("Failed to create SSH session: {}", e))?;

        session.set_tcp_stream(tcp);
        session.set_timeout(15000); // 15s timeout for SSH operations
        configure_ssh_algorithms(&session);
        session.handshake()
            .map_err(|e| format!("SSH handshake failed: {}", e))?;

        // Enable SSH keepalive: send keepalive every 30s, allow 3 missed responses
        session.set_keepalive(true, 30);

        // Authenticate
        if let Some(key_content) = private_key {
            let key_bytes = prepare_private_key(key_content)?;
            let temp_dir = std::env::temp_dir();
            let key_path = temp_dir.join(format!("novashell_ssh_key_{}", session_id));
            std::fs::write(&key_path, &key_bytes)
                .map_err(|e| format!("Failed to write temp key: {}", e))?;
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                let _ = std::fs::set_permissions(&key_path, std::fs::Permissions::from_mode(0o600));
            }

            let result = session.userauth_pubkey_file(
                username,
                None,
                &key_path,
                password,
            );

            secure_delete(&key_path);
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

        // Keep session in BLOCKING mode — use read timeout for non-blocking behavior
        // This avoids the race condition of switching blocking/non-blocking between threads
        session.set_blocking(true);
        session.set_timeout(10); // 10ms timeout — low-latency interactive terminal

        let session = Arc::new(Mutex::new(session));
        let channel = Arc::new(Mutex::new(channel));

        let running = Arc::new(AtomicBool::new(true));
        let sid = session_id.to_string();

        // Write queue — IPC pushes here (instant), reader thread processes (no lock contention)
        let (write_tx, write_rx) = mpsc::sync_channel::<Vec<u8>>(256);

        // Shared batch buffer + condvar for efficient batching (mirrors PTY pattern)
        let batch: Arc<Mutex<String>> = Arc::new(Mutex::new(String::new()));
        let data_ready = Arc::new(Condvar::new());

        // Rolling scrollback buffer (last 64KB) — mirrors PTY pattern
        let scrollback: Arc<Mutex<String>> = Arc::new(Mutex::new(String::new()));

        // Pre-build event names to avoid repeated allocations
        let data_event = format!("ssh-data-{}", sid);
        let exit_event = format!("ssh-exit-{}", sid);
        let error_event = format!("ssh-error-{}", sid);

        // Reader thread: processes writes from queue + reads from SSH channel
        // All channel I/O happens in this single thread — zero lock contention with IPC
        let running_reader = Arc::clone(&running);
        let channel_clone = Arc::clone(&channel);
        let session_clone = Arc::clone(&session);
        let batch_reader = Arc::clone(&batch);
        let data_ready_reader = Arc::clone(&data_ready);
        let scrollback_reader = Arc::clone(&scrollback);
        let app_handle_reader = app_handle.clone();
        let data_event_reader = data_event.clone();
        let exit_event_reader = exit_event.clone();
        let error_event_reader = error_event.clone();

        let reader_thread = std::thread::spawn(move || {
            // Helper: append data to scrollback buffer when reader emits directly (bypassing flusher)
            let append_scrollback = |data: &str| {
                if let Ok(mut sb) = scrollback_reader.lock() {
                    sb.push_str(data);
                    if sb.len() > 65536 {
                        let mut trim = sb.len() - 65536;
                        while trim < sb.len() && !sb.is_char_boundary(trim) {
                            trim += 1;
                        }
                        if trim < sb.len() {
                            sb.drain(..trim);
                        }
                    }
                }
            };

            let mut buf = [0u8; 16384]; // 16KB buffer
            let mut utf8_remainder: Vec<u8> = Vec::new(); // holds incomplete UTF-8 bytes between reads
            let mut consecutive_errors: u32 = 0;
            let max_consecutive_errors: u32 = 60; // ~6s of transient errors before giving up
            let mut last_keepalive = Instant::now();
            let keepalive_interval = Duration::from_secs(15);

            loop {
                if !running_reader.load(Ordering::Relaxed) {
                    break;
                }

                // Single lock scope: process writes + read in one lock acquire
                let result = {
                    let mut ch = match channel_clone.lock() {
                        Ok(ch) => ch,
                        Err(_) => break,
                    };

                    // 1. Process pending writes FIRST (input has priority)
                    // Flush once after draining all pending writes (not per-message)
                    {
                        use std::io::Write;
                        let mut wrote = false;
                        while let Ok(data) = write_rx.try_recv() {
                            let _ = ch.write_all(&data);
                            wrote = true;
                        }
                        if wrote {
                            let _ = ch.flush();
                        }
                    }

                    // 2. Check EOF
                    if ch.eof() {
                        if let Ok(mut b) = batch_reader.lock() {
                            if !b.is_empty() {
                                let data = std::mem::take(&mut *b);
                                append_scrollback(&data);
                                let _ = app_handle_reader.emit(&data_event_reader, data);
                            }
                        }
                        let _ = app_handle_reader.emit(&exit_event_reader, ());
                        break;
                    }

                    // 3. Read from channel (all in same lock — zero contention)
                    ch.read(&mut buf)
                };

                match result {
                    Ok(0) => {
                        if let Ok(mut b) = batch_reader.lock() {
                            if !b.is_empty() {
                                let data = std::mem::take(&mut *b);
                                append_scrollback(&data);
                                let _ = app_handle_reader.emit(&data_event_reader, data);
                            }
                        }
                        let _ = app_handle_reader.emit(&exit_event_reader, ());
                        break;
                    }
                    Ok(n) => {
                        consecutive_errors = 0;
                        // Prepend any leftover bytes from previous read's incomplete UTF-8
                        let data = if utf8_remainder.is_empty() {
                            &buf[..n]
                        } else {
                            utf8_remainder.extend_from_slice(&buf[..n]);
                            utf8_remainder.as_slice()
                        };
                        if let Ok(mut b) = batch_reader.lock() {
                            // Handle UTF-8 boundary: valid prefix goes to batch, incomplete tail saved for next read
                            match std::str::from_utf8(data) {
                                Ok(s) => {
                                    b.push_str(s);
                                    utf8_remainder.clear();
                                }
                                Err(e) => {
                                    let valid_up_to = e.valid_up_to();
                                    // Push the valid portion
                                    if valid_up_to > 0 {
                                        // Safety: from_utf8 confirmed these bytes are valid
                                        b.push_str(unsafe { std::str::from_utf8_unchecked(&data[..valid_up_to]) });
                                    }
                                    // Check if error is at end (incomplete sequence) vs mid-stream (invalid byte)
                                    match e.error_len() {
                                        None => {
                                            // Incomplete sequence at end — save for next read
                                            let remainder = data[valid_up_to..].to_vec();
                                            utf8_remainder = remainder;
                                        }
                                        Some(_) => {
                                            // Invalid byte(s) mid-stream — use lossy for the rest
                                            b.push_str(&String::from_utf8_lossy(&data[valid_up_to..]));
                                            utf8_remainder.clear();
                                        }
                                    }
                                }
                            }
                            // Flush immediately if batch is large (fast output like `ls -la`)
                            if b.len() > 8192 {
                                let data = std::mem::take(&mut *b);
                                append_scrollback(&data);
                                let _ = app_handle_reader.emit(&data_event_reader, data);
                            } else {
                                // Signal flusher that data is ready
                                data_ready_reader.notify_one();
                            }
                        }
                    }
                    Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock
                        || e.kind() == std::io::ErrorKind::TimedOut => {
                        consecutive_errors = 0;
                        // Flush any pending batch data immediately on idle
                        // This ensures prompt output isn't delayed by 4ms flusher wait
                        if let Ok(mut b) = batch_reader.lock() {
                            if !b.is_empty() {
                                let data = std::mem::take(&mut *b);
                                append_scrollback(&data);
                                let _ = app_handle_reader.emit(&data_event_reader, data);
                            }
                        }
                        // Send keepalive at proper intervals
                        if last_keepalive.elapsed() >= keepalive_interval {
                            if let Ok(session) = session_clone.lock() {
                                let _ = session.keepalive_send();
                            }
                            last_keepalive = Instant::now();
                        }
                    }
                    Err(ref e) if e.kind() == std::io::ErrorKind::ConnectionReset
                        || e.kind() == std::io::ErrorKind::BrokenPipe
                        || e.kind() == std::io::ErrorKind::ConnectionAborted => {
                        if let Ok(mut b) = batch_reader.lock() {
                            if !b.is_empty() {
                                let data = std::mem::take(&mut *b);
                                append_scrollback(&data);
                                let _ = app_handle_reader.emit(&data_event_reader, data);
                            }
                        }
                        let msg = format!("SSH connection lost: {}", e);
                        let _ = app_handle_reader.emit(&error_event_reader, msg);
                        break;
                    }
                    Err(ref e) => {
                        // libssh2 on Windows often maps timeouts/EAGAIN as ErrorKind::Other
                        // instead of WouldBlock/TimedOut. Check the error message to distinguish
                        // harmless timeouts from real transport errors.
                        let is_other = e.kind() == std::io::ErrorKind::Other;
                        let is_timeout_like = if is_other {
                            let msg = e.to_string().to_lowercase();
                            msg.contains("timeout") || msg.contains("would block")
                                || msg.contains("eagain") || msg.contains("timed out")
                                || msg.contains("-37") || msg.contains("-43")
                        } else {
                            false
                        };

                        // If it's actually a timeout/EAGAIN from libssh2, treat like WouldBlock
                        if is_timeout_like {
                            consecutive_errors = 0;
                            if let Ok(mut b) = batch_reader.lock() {
                                if !b.is_empty() {
                                    let data = std::mem::take(&mut *b);
                                    append_scrollback(&data);
                                    let _ = app_handle_reader.emit(&data_event_reader, data);
                                }
                            }
                            if last_keepalive.elapsed() >= keepalive_interval {
                                if let Ok(session) = session_clone.lock() {
                                    let _ = session.keepalive_send();
                                }
                                last_keepalive = Instant::now();
                            }
                            continue;
                        }

                        consecutive_errors += 1;

                        // Before giving up on transient errors, try keepalive to verify connection
                        if is_other && consecutive_errors == max_consecutive_errors / 2 {
                            if let Ok(session) = session_clone.lock() {
                                if session.keepalive_send().is_ok() {
                                    consecutive_errors = 0;
                                    continue;
                                }
                            }
                        }

                        if consecutive_errors >= max_consecutive_errors {
                            if let Ok(mut b) = batch_reader.lock() {
                                if !b.is_empty() {
                                    let data = std::mem::take(&mut *b);
                                    append_scrollback(&data);
                                    let _ = app_handle_reader.emit(&data_event_reader, data);
                                }
                            }
                            let msg = format!("SSH connection lost: {}", e);
                            let _ = app_handle_reader.emit(&error_event_reader, msg);
                            break;
                        }

                        // Short backoff for real transient errors (not timeouts)
                        let backoff = if is_other {
                            5 + (consecutive_errors as u64 * 2).min(50)
                        } else {
                            5
                        };
                        std::thread::sleep(Duration::from_millis(backoff));
                    }
                }
            }
        });

        // Flusher thread: waits for data signal, then emits batch
        // Uses Condvar — zero CPU when idle, batches rapid output
        let running_flusher = Arc::clone(&running);
        let batch_flusher = Arc::clone(&batch);
        let data_ready_flusher = Arc::clone(&data_ready);
        let scrollback_flusher = Arc::clone(&scrollback);

        let flusher_thread = std::thread::spawn(move || {
            loop {
                // Single lock: wait for signal then flush in same scope
                let should_emit = 'flush: {
                    let lock = match batch_flusher.lock() {
                        Ok(l) => l,
                        Err(e) => e.into_inner(),
                    };
                    let mut guard = match data_ready_flusher.wait_timeout(lock, Duration::from_millis(4)) {
                        Ok((g, _)) => g,
                        Err(_) => break 'flush None,
                    };
                    if !guard.is_empty() {
                        Some(std::mem::take(&mut *guard))
                    } else {
                        None
                    }
                };

                if !running_flusher.load(Ordering::Relaxed) {
                    break;
                }

                if let Some(data) = should_emit {
                    // Append to scrollback buffer (keep last 64KB)
                    if let Ok(mut sb) = scrollback_flusher.lock() {
                        sb.push_str(&data);
                        if sb.len() > 65536 {
                            let mut trim = sb.len() - 65536;
                            while trim < sb.len() && !sb.is_char_boundary(trim) {
                                trim += 1;
                            }
                            if trim < sb.len() {
                                sb.drain(..trim);
                            }
                        }
                    }

                    let _ = app_handle.emit(&data_event, data);
                }
            }
        });

        Ok(SshSession {
            session,
            channel,
            _reader_thread: Some(reader_thread),
            _flusher_thread: Some(flusher_thread),
            running,
            write_tx,
            scrollback,
        })
    }

    pub fn write(&self, data: &[u8]) -> Result<(), String> {
        // Push to write queue — instant, zero blocking
        // The reader thread drains the queue and writes to the SSH channel
        self.write_tx.send(data.to_vec())
            .map_err(|e| format!("SSH write queue error: {}", e))
    }

    pub fn resize(&self, cols: u32, rows: u32) -> Result<(), String> {
        let mut channel = self.channel.lock()
            .map_err(|e| format!("Channel lock error: {}", e))?;

        let mut retries = 0;
        loop {
            match channel.request_pty_size(cols, rows, None, None) {
                Ok(()) => break,
                Err(ref e) if retries < 3 => {
                    let code = e.code();
                    if code == ssh2::ErrorCode::Session(-37) || code == ssh2::ErrorCode::Session(-43) {
                        // EAGAIN or timeout — retry
                        retries += 1;
                        std::thread::sleep(Duration::from_millis(15));
                    } else {
                        return Err(format!("SSH resize error: {}", e));
                    }
                }
                Err(e) => return Err(format!("SSH resize error: {}", e)),
            }
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

    /// Get Arc refs for resize without borrowing self (allows use from spawn_blocking)
    pub fn get_resize_refs(&self) -> (Arc<Mutex<Session>>, Arc<Mutex<ssh2::Channel>>) {
        (Arc::clone(&self.session), Arc::clone(&self.channel))
    }

    /// Get the current scrollback buffer content (for restoring terminal on re-open).
    pub fn get_scrollback(&self) -> String {
        self.scrollback
            .lock()
            .map(|sb| sb.clone())
            .unwrap_or_default()
    }
}

/// Resize an SSH channel using pre-extracted Arc refs (callable from spawn_blocking)
pub fn resize_with_refs(
    _session: &Arc<Mutex<Session>>,
    channel: &Arc<Mutex<ssh2::Channel>>,
    cols: u32,
    rows: u32,
) -> Result<(), String> {
    let mut ch = channel.lock()
        .map_err(|e| format!("Channel lock error: {}", e))?;

    let mut retries = 0;
    loop {
        match ch.request_pty_size(cols, rows, None, None) {
            Ok(()) => break,
            Err(ref e) if retries < 3 => {
                let code = e.code();
                if code == ssh2::ErrorCode::Session(-37) || code == ssh2::ErrorCode::Session(-43) {
                    retries += 1;
                    std::thread::sleep(Duration::from_millis(10));
                } else {
                    return Err(format!("SSH resize error: {}", e));
                }
            }
            Err(e) => return Err(format!("SSH resize error: {}", e)),
        }
    }
    Ok(())
}

// ──────────── Log Stream (tail -f over SSH) ────────────

pub struct LogStream {
    running: Arc<AtomicBool>,
    _reader_thread: Option<JoinHandle<()>>,
}

impl Drop for LogStream {
    fn drop(&mut self) {
        self.running.store(false, Ordering::Relaxed);
        if let Some(h) = self._reader_thread.take() { let _ = h.join(); }
    }
}

impl LogStream {
    pub fn new(
        host: &str,
        port: u16,
        username: &str,
        password: Option<&str>,
        private_key: Option<&str>,
        command: &str,
        stream_id: &str,
        app_handle: tauri::AppHandle,
    ) -> Result<Self, String> {
        let addr = format!("{}:{}", host, port);

        use std::net::ToSocketAddrs;
        let socket_addr = addr
            .to_socket_addrs()
            .map_err(|e| format!("Cannot resolve {}: {}", addr, e))?
            .next()
            .ok_or_else(|| format!("Could not resolve host: {}", host))?;

        let tcp = TcpStream::connect_timeout(&socket_addr, std::time::Duration::from_secs(10))
            .map_err(|e| format!("TCP failed: {}", e))?;
        tcp.set_nodelay(true).ok();

        let mut session = Session::new().map_err(|e| format!("Session error: {}", e))?;
        session.set_tcp_stream(tcp);
        session.set_timeout(15000);
        configure_ssh_algorithms(&session);
        session.handshake().map_err(|e| format!("Handshake failed: {}", e))?;
        session.set_keepalive(true, 30);

        // Authenticate
        if let Some(key_content) = private_key {
            let key_bytes = prepare_private_key(key_content)?;
            let temp_dir = std::env::temp_dir();
            let key_path = temp_dir.join(format!("novashell_logstream_{}", stream_id));
            std::fs::write(&key_path, &key_bytes).map_err(|e| format!("Key write error: {}", e))?;
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                let _ = std::fs::set_permissions(&key_path, std::fs::Permissions::from_mode(0o600));
            }
            let result = session.userauth_pubkey_file(username, None, &key_path, password);
            secure_delete(&key_path);
            result.map_err(|e| format!("Key auth failed: {}", e))?;
        } else if let Some(pass) = password {
            session.userauth_password(username, pass).map_err(|e| format!("Auth failed: {}", e))?;
        } else {
            return Err("No auth method".to_string());
        }

        if !session.authenticated() { return Err("Authentication failed".to_string()); }

        // Execute the tail -f command (no PTY needed)
        let mut channel = session.channel_session().map_err(|e| format!("Channel error: {}", e))?;
        channel.exec(command).map_err(|e| format!("Exec error: {}", e))?;

        session.set_blocking(true);
        session.set_timeout(500); // 500ms read timeout

        let running = Arc::new(AtomicBool::new(true));
        let running_clone = Arc::clone(&running);
        let data_event = format!("log-stream-data-{}", stream_id);

        let reader_thread = std::thread::spawn(move || {
            let mut buf = [0u8; 16384]; // 16KB buffer
            let mut batch = String::new();
            let mut last_flush = Instant::now();
            let flush_interval = Duration::from_millis(50); // batch log output

            loop {
                if !running_clone.load(Ordering::Relaxed) { break; }
                match channel.read(&mut buf) {
                    Ok(0) => {
                        if !batch.is_empty() {
                            let _ = app_handle.emit(&data_event, std::mem::take(&mut batch));
                        }
                        break;
                    }
                    Ok(n) => {
                        match std::str::from_utf8(&buf[..n]) {
                            Ok(s) => batch.push_str(s),
                            Err(_) => batch.push_str(&String::from_utf8_lossy(&buf[..n])),
                        }
                        // Flush if batch is large or interval elapsed
                        if batch.len() > 16384 || last_flush.elapsed() >= flush_interval {
                            let _ = app_handle.emit(&data_event, std::mem::take(&mut batch));
                            last_flush = Instant::now();
                        }
                    }
                    Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock
                        || e.kind() == std::io::ErrorKind::TimedOut => {
                        // Flush any pending data on timeout (no sleep needed — session timeout handles pacing)
                        if !batch.is_empty() {
                            let _ = app_handle.emit(&data_event, std::mem::take(&mut batch));
                            last_flush = Instant::now();
                        }
                    }
                    Err(_) => {
                        if !batch.is_empty() {
                            let _ = app_handle.emit(&data_event, std::mem::take(&mut batch));
                        }
                        break;
                    }
                }
            }
            let _ = session.disconnect(None, "Log stream closed", None);
        });

        Ok(LogStream { running, _reader_thread: Some(reader_thread) })
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

    use std::net::ToSocketAddrs;
    let socket_addr = addr
        .to_socket_addrs()
        .map_err(|e| format!("Cannot resolve {}: {}", addr, e))?
        .next()
        .ok_or_else(|| format!("Could not resolve host: {}", host))?;

    let tcp = TcpStream::connect_timeout(
        &socket_addr,
        std::time::Duration::from_secs(10),
    ).map_err(|e| format!("Connection failed to {}: {}", addr, e))?;

    let mut session = Session::new()
        .map_err(|e| format!("Session creation failed: {}", e))?;

    session.set_tcp_stream(tcp);
    session.set_timeout(10000);
    configure_ssh_algorithms(&session);
    session.handshake()
        .map_err(|e| format!("Handshake failed: {}", e))?;

    if let Some(key_content) = private_key {
        let key_bytes = prepare_private_key(key_content)?;
        let temp_dir = std::env::temp_dir();
        let key_path = temp_dir.join(format!("novashell_ssh_test_{}", uuid::Uuid::new_v4()));
        std::fs::write(&key_path, &key_bytes)
            .map_err(|e| format!("Failed to write temp key: {}", e))?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = std::fs::set_permissions(&key_path, std::fs::Permissions::from_mode(0o600));
        }

        let result = session.userauth_pubkey_file(username, None, &key_path, password);
        secure_delete(&key_path);
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

/// Execute a command on a remote server via a temporary SSH connection.
/// Returns (stdout, exit_code). Creates and closes its own session.
pub fn exec_command(
    host: &str,
    port: u16,
    username: &str,
    password: Option<&str>,
    private_key: Option<&str>,
    command: &str,
) -> Result<(String, i32), String> {
    let addr = format!("{}:{}", host, port);

    use std::net::ToSocketAddrs;
    let socket_addr = addr
        .to_socket_addrs()
        .map_err(|e| format!("Cannot resolve {}: {}", addr, e))?
        .next()
        .ok_or_else(|| format!("Could not resolve host: {}", host))?;

    let tcp = TcpStream::connect_timeout(
        &socket_addr,
        std::time::Duration::from_secs(10),
    ).map_err(|e| format!("Connection failed to {}: {}", addr, e))?;

    let mut session = Session::new()
        .map_err(|e| format!("Session creation failed: {}", e))?;

    session.set_tcp_stream(tcp);
    session.set_timeout(15000);
    configure_ssh_algorithms(&session);
    session.handshake()
        .map_err(|e| format!("Handshake failed: {}", e))?;

    // Authenticate
    if let Some(key_content) = private_key {
        let key_bytes = prepare_private_key(key_content)?;
        let temp_dir = std::env::temp_dir();
        let key_path = temp_dir.join(format!("novashell_exec_{}", uuid::Uuid::new_v4()));
        std::fs::write(&key_path, &key_bytes)
            .map_err(|e| format!("Failed to write temp key: {}", e))?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = std::fs::set_permissions(&key_path, std::fs::Permissions::from_mode(0o600));
        }
        let result = session.userauth_pubkey_file(username, None, &key_path, password);
        secure_delete(&key_path);
        result.map_err(|e| format!("Key auth failed: {}", e))?;
    } else if let Some(pass) = password {
        session.userauth_password(username, pass)
            .map_err(|e| format!("Password auth failed: {}", e))?;
    } else {
        return Err("No authentication method provided".to_string());
    }

    if !session.authenticated() {
        return Err("Authentication failed".to_string());
    }

    // Execute command
    let mut channel = session.channel_session()
        .map_err(|e| format!("Channel error: {}", e))?;
    channel.exec(command)
        .map_err(|e| format!("Exec error: {}", e))?;

    // Read with a 10MB cap to prevent OOM from commands with unbounded output
    let mut stdout = String::new();
    let max_read: usize = 10 * 1024 * 1024;
    let mut buf = [0u8; 32768];
    loop {
        match channel.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => {
                match std::str::from_utf8(&buf[..n]) {
                    Ok(s) => stdout.push_str(s),
                    Err(_) => stdout.push_str(&String::from_utf8_lossy(&buf[..n])),
                }
                if stdout.len() > max_read {
                    stdout.truncate(max_read);
                    break;
                }
            }
            Err(e) => return Err(format!("Read error: {}", e)),
        }
    }

    channel.wait_close().ok();
    let exit_code = channel.exit_status().unwrap_or(-1);

    let _ = session.disconnect(None, "Exec complete", None);

    Ok((stdout, exit_code))
}
