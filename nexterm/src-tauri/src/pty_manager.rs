use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use std::io::{Read, Write};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Condvar, Mutex};
use std::thread::JoinHandle;
use std::time::Duration;
use tauri::Emitter;
use tokio::sync::broadcast;

pub struct PtySession {
    master: Arc<Mutex<Box<dyn MasterPty + Send>>>,
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
    _reader_thread: Option<JoinHandle<()>>,
    _flusher_thread: Option<JoinHandle<()>>,
    running: Arc<AtomicBool>,
    /// Optional broadcast sender for collab — set when sharing this session.
    /// The reader/flusher threads check this and fan out data when Some.
    collab_tx: Arc<Mutex<Option<broadcast::Sender<String>>>>,
    /// Rolling scrollback buffer for late-joining collab guests (last 64KB).
    scrollback: Arc<Mutex<String>>,
}

impl Drop for PtySession {
    fn drop(&mut self) {
        self.running.store(false, Ordering::SeqCst);
        // Only join flusher thread (exits quickly after running=false)
        if let Some(handle) = self._flusher_thread.take() {
            let _ = handle.join();
        }
        // Do NOT join reader thread — reader.read() blocks on ConPTY until
        // the master PTY is dropped. Since master is a struct field, it gets
        // dropped AFTER drop() returns, so joining here would deadlock.
        if let Some(handle) = self._reader_thread.take() {
            drop(handle);
        }
    }
}

impl PtySession {
    pub fn new(
        shell_path: &str,
        session_id: &str,
        app_handle: tauri::AppHandle,
    ) -> Result<Self, Box<dyn std::error::Error>> {
        let pty_system = native_pty_system();

        let pair = pty_system.openpty(PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        })?;

        let mut cmd = CommandBuilder::new(shell_path);
        let cwd = dirs::home_dir()
            .or_else(|| std::env::current_dir().ok())
            .unwrap_or_else(|| std::path::PathBuf::from("."));
        cmd.cwd(cwd);

        cmd.env("TERM", "xterm-256color");
        cmd.env("COLORTERM", "truecolor");
        cmd.env("CLICOLOR", "1");
        cmd.env("CLICOLOR_FORCE", "1");
        cmd.env("FORCE_COLOR", "3");

        let _child = pair.slave.spawn_command(cmd)?;
        drop(pair.slave);

        let mut reader = pair.master.try_clone_reader()?;
        let writer = pair.master.take_writer()?;

        let running = Arc::new(AtomicBool::new(true));
        let sid = session_id.to_string();

        // Shared batch buffer + condvar for efficient wakeup
        let batch: Arc<Mutex<String>> = Arc::new(Mutex::new(String::new()));
        let data_ready = Arc::new(Condvar::new());

        // Reader thread: reads from PTY and appends to shared batch
        let running_reader = Arc::clone(&running);
        let batch_reader = Arc::clone(&batch);
        let data_ready_reader = Arc::clone(&data_ready);
        let app_handle_reader = app_handle.clone();
        let event_name = format!("pty-data-{}", sid);
        let exit_event = format!("pty-exit-{}", sid);
        let error_event = format!("pty-error-{}", sid);

        let reader_thread = std::thread::spawn(move || {
            let mut buf = [0u8; 16384]; // 16KB buffer — matches SSH for consistent throughput
            let mut utf8_remainder: Vec<u8> = Vec::new(); // holds incomplete UTF-8 bytes between reads

            loop {
                if !running_reader.load(Ordering::Relaxed) {
                    break;
                }

                match reader.read(&mut buf) {
                    Ok(0) => {
                        // Flush remaining data before exit
                        if let Ok(mut b) = batch_reader.lock() {
                            if !b.is_empty() {
                                let _ = app_handle_reader.emit(&event_name, std::mem::take(&mut *b));
                            }
                        }
                        let _ = app_handle_reader.emit(&exit_event, ());
                        break;
                    }
                    Ok(n) => {
                        // Prepend any leftover bytes from previous read's incomplete UTF-8
                        let data = if utf8_remainder.is_empty() {
                            &buf[..n]
                        } else {
                            utf8_remainder.extend_from_slice(&buf[..n]);
                            utf8_remainder.as_slice()
                        };
                        if let Ok(mut b) = batch_reader.lock() {
                            match std::str::from_utf8(data) {
                                Ok(s) => {
                                    b.push_str(s);
                                    utf8_remainder.clear();
                                }
                                Err(e) => {
                                    let valid_up_to = e.valid_up_to();
                                    if valid_up_to > 0 {
                                        b.push_str(unsafe { std::str::from_utf8_unchecked(&data[..valid_up_to]) });
                                    }
                                    match e.error_len() {
                                        None => {
                                            // Incomplete sequence at end — save for next read
                                            utf8_remainder = data[valid_up_to..].to_vec();
                                        }
                                        Some(_) => {
                                            b.push_str(&String::from_utf8_lossy(&data[valid_up_to..]));
                                            utf8_remainder.clear();
                                        }
                                    }
                                }
                            }
                            // Flush immediately if batch is large (fast output like `cat` large file)
                            if b.len() > 16384 {
                                let _ = app_handle_reader.emit(&event_name, std::mem::take(&mut *b));
                            } else {
                                // Signal flusher that data is ready
                                data_ready_reader.notify_one();
                            }
                        }
                    }
                    Err(e) => {
                        if let Ok(mut b) = batch_reader.lock() {
                            if !b.is_empty() {
                                let _ = app_handle_reader.emit(&event_name, std::mem::take(&mut *b));
                            }
                        }
                        let msg = format!("PTY read error: {}", e);
                        let _ = app_handle_reader.emit(&error_event, msg);
                        break;
                    }
                }
            }
        });

        // Collab broadcast + scrollback (initialized empty, set later if sharing)
        let collab_tx: Arc<Mutex<Option<broadcast::Sender<String>>>> =
            Arc::new(Mutex::new(None));
        let scrollback: Arc<Mutex<String>> = Arc::new(Mutex::new(String::new()));

        // Flusher thread: waits for data signal, then emits batch
        // Uses Condvar instead of 16ms spin-loop — zero CPU when idle
        let running_flusher = Arc::clone(&running);
        let batch_flusher = Arc::clone(&batch);
        let data_ready_flusher = Arc::clone(&data_ready);
        let flush_event = format!("pty-data-{}", sid);
        let collab_tx_flusher = Arc::clone(&collab_tx);
        let scrollback_flusher = Arc::clone(&scrollback);

        let flusher_thread = std::thread::spawn(move || {
            loop {
                // Wait for data signal or 16ms timeout (~60fps rendering)
                {
                    let lock = match batch_flusher.lock() {
                        Ok(l) => l,
                        Err(e) => e.into_inner(), // recover from poisoned mutex
                    };
                    let _ = data_ready_flusher.wait_timeout(lock, Duration::from_millis(16));
                }

                if !running_flusher.load(Ordering::Relaxed) {
                    break;
                }

                if let Ok(mut b) = batch_flusher.lock() {
                    if !b.is_empty() {
                        let data = std::mem::take(&mut *b);

                        // Fan out to collab broadcast if active
                        if let Ok(ctx) = collab_tx_flusher.lock() {
                            if let Some(ref tx) = *ctx {
                                let _ = tx.send(data.clone());
                            }
                        }

                        // Append to scrollback buffer (keep last 64KB)
                        if let Ok(mut sb) = scrollback_flusher.lock() {
                            sb.push_str(&data);
                            if sb.len() > 65536 {
                                let mut trim = sb.len() - 65536;
                                // Ensure trim lands on a valid UTF-8 boundary
                                while trim < sb.len() && !sb.is_char_boundary(trim) {
                                    trim += 1;
                                }
                                if trim < sb.len() {
                                    *sb = sb[trim..].to_string();
                                }
                            }
                        }

                        let _ = app_handle.emit(&flush_event, data);
                    }
                }
            }
        });

        Ok(PtySession {
            master: Arc::new(Mutex::new(pair.master)),
            writer: Arc::new(Mutex::new(writer)),
            _reader_thread: Some(reader_thread),
            _flusher_thread: Some(flusher_thread),
            running,
            collab_tx,
            scrollback,
        })
    }

    pub fn write(&self, data: &[u8]) -> Result<(), Box<dyn std::error::Error>> {
        let mut writer = self.writer.lock()
            .map_err(|e| format!("Writer lock poisoned: {}", e))?;
        writer.write_all(data)?;
        writer.flush()?;
        Ok(())
    }

    pub fn resize(&self, cols: u16, rows: u16) -> Result<(), Box<dyn std::error::Error>> {
        let master = self.master.lock()
            .map_err(|e| format!("Master lock poisoned: {}", e))?;
        master.resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })?;
        Ok(())
    }

    // ──── Collab support ────

    /// Enable collab broadcasting. Returns a receiver for the collab server.
    pub fn enable_collab(&self) -> broadcast::Receiver<String> {
        let (tx, rx) = broadcast::channel::<String>(256);
        if let Ok(mut ctx) = self.collab_tx.lock() {
            *ctx = Some(tx);
        }
        rx
    }

    /// Disable collab broadcasting.
    pub fn disable_collab(&self) {
        if let Ok(mut ctx) = self.collab_tx.lock() {
            *ctx = None;
        }
    }

    /// Get the current scrollback buffer content.
    pub fn get_scrollback(&self) -> String {
        self.scrollback
            .lock()
            .map(|sb| sb.clone())
            .unwrap_or_default()
    }
}
