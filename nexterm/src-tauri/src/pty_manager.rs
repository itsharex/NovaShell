use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use std::io::{Read, Write};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Condvar, Mutex};
use std::thread::JoinHandle;
use std::time::Duration;
use tauri::Emitter;

pub struct PtySession {
    master: Arc<Mutex<Box<dyn MasterPty + Send>>>,
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
    _reader_thread: Option<JoinHandle<()>>,
    _flusher_thread: Option<JoinHandle<()>>,
    running: Arc<AtomicBool>,
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
            let mut buf = [0u8; 8192];

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
                        if let Ok(mut b) = batch_reader.lock() {
                            b.push_str(&String::from_utf8_lossy(&buf[..n]));
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

        // Flusher thread: waits for data signal, then emits batch
        // Uses Condvar instead of 16ms spin-loop — zero CPU when idle
        let running_flusher = Arc::clone(&running);
        let batch_flusher = Arc::clone(&batch);
        let data_ready_flusher = Arc::clone(&data_ready);
        let flush_event = format!("pty-data-{}", sid);

        let flusher_thread = std::thread::spawn(move || {
            loop {
                // Wait for data signal or 50ms timeout (for smooth rendering)
                {
                    let lock = match batch_flusher.lock() {
                        Ok(l) => l,
                        Err(e) => e.into_inner(), // recover from poisoned mutex
                    };
                    let _ = data_ready_flusher.wait_timeout(lock, Duration::from_millis(50));
                }

                if !running_flusher.load(Ordering::Relaxed) {
                    break;
                }

                if let Ok(mut b) = batch_flusher.lock() {
                    if !b.is_empty() {
                        let _ = app_handle.emit(&flush_event, std::mem::take(&mut *b));
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
}
