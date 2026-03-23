use futures_util::{SinkExt, StreamExt};
use rand::Rng;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::Emitter;
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{broadcast, Mutex as TokioMutex, RwLock as TokioRwLock};
use tokio_tungstenite::tungstenite::Message;

// ──────────── Protocol Messages ────────────

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(tag = "type", content = "payload")]
pub enum CollabMessage {
    /// Guest -> Host: authenticate with session code
    AuthRequest { code: String, name: String },
    /// Host -> Guest: auth result + initial state
    AuthResponse {
        ok: bool,
        error: Option<String>,
        scrollback: Option<String>,
        users: Option<Vec<CollabUserInfo>>,
        terminal_size: Option<(u16, u16)>,
    },
    /// Host -> Guests: terminal output
    PtyData { data: String },
    /// Guest -> Host: keyboard input (only if full-control)
    PtyInput { data: String },
    /// Host -> Guests: terminal resize
    Resize { cols: u16, rows: u16 },
    /// Bidirectional: chat
    ChatMessage {
        id: String,
        sender: String,
        content: String,
        timestamp: u64,
    },
    /// Host -> Guests: user joined
    UserJoined { user: CollabUserInfo },
    /// Host -> Guests: user left
    UserLeft { user_id: String },
    /// Host -> Guest: permission changed
    PermissionChanged {
        user_id: String,
        permission: CollabPermission,
    },
    /// Host -> Guest: kicked
    Kicked { reason: String },
    /// Bidirectional: keepalive
    Heartbeat,
    Pong,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub enum CollabPermission {
    ReadOnly,
    FullControl,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CollabUserInfo {
    pub id: String,
    pub name: String,
    pub permission: CollabPermission,
    pub is_host: bool,
}

// ──────────── Guest State (server-side) ────────────

struct Guest {
    id: String,
    name: String,
    permission: CollabPermission,
    tx: futures_util::stream::SplitSink<
        tokio_tungstenite::WebSocketStream<TcpStream>,
        Message,
    >,
}

// ──────────── Collab Session ────────────

pub struct CollabSession {
    pub session_code: String,
    pub pty_session_id: String,
    pub host_name: String,
    pub port: u16,
    pub terminal_cols: u16,
    pub terminal_rows: u16,
    running: Arc<AtomicBool>,
    guests: Arc<TokioRwLock<HashMap<String, Guest>>>,
    chat_history: Arc<TokioMutex<Vec<CollabMessage>>>,
    /// Receives PTY output to broadcast to guests
    pty_rx: Option<broadcast::Receiver<String>>,
    /// Rate limiting: failed auth attempts per IP
    failed_attempts: Arc<TokioMutex<HashMap<String, (u32, Instant)>>>,
}

/// Info returned to frontend when hosting starts
#[derive(Serialize, Clone)]
pub struct CollabHostInfo {
    pub session_code: String,
    pub port: u16,
    pub local_ips: Vec<String>,
}

/// Info returned to frontend when joining
#[derive(Serialize, Clone)]
pub struct CollabJoinInfo {
    pub collab_id: String,
    pub host_name: String,
    pub permission: CollabPermission,
    pub users: Vec<CollabUserInfo>,
    pub terminal_size: (u16, u16),
}

// ──────────── Session Code Generation ────────────

fn generate_session_code() -> String {
    let mut rng = rand::thread_rng();
    let chars: Vec<char> = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".chars().collect();
    (0..6).map(|_| chars[rng.gen_range(0..chars.len())]).collect()
}

fn now_unix_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

// ──────────── Get local IPs ────────────

fn get_local_ips() -> Vec<String> {
    let mut ips = Vec::new();
    // Try to bind a UDP socket to find the default route IP
    if let Ok(socket) = std::net::UdpSocket::bind("0.0.0.0:0") {
        // Connect to a public IP (doesn't actually send data)
        if socket.connect("8.8.8.8:80").is_ok() {
            if let Ok(addr) = socket.local_addr() {
                let ip = addr.ip().to_string();
                if ip != "0.0.0.0" {
                    ips.push(ip);
                }
            }
        }
    }
    if ips.is_empty() {
        ips.push("127.0.0.1".to_string());
    }
    ips
}

// ──────────── Host: Start Collab Server ────────────

impl CollabSession {
    pub fn new(
        pty_session_id: String,
        host_name: String,
        pty_broadcast_rx: broadcast::Receiver<String>,
        cols: u16,
        rows: u16,
    ) -> Self {
        CollabSession {
            session_code: generate_session_code(),
            pty_session_id,
            host_name,
            port: 0,
            terminal_cols: cols,
            terminal_rows: rows,
            running: Arc::new(AtomicBool::new(true)),
            guests: Arc::new(TokioRwLock::new(HashMap::new())),
            chat_history: Arc::new(TokioMutex::new(Vec::new())),
            pty_rx: Some(pty_broadcast_rx),
            failed_attempts: Arc::new(TokioMutex::new(HashMap::new())),
        }
    }

    /// Start the WebSocket server. Returns the bound port.
    pub async fn start(
        &mut self,
        app_handle: tauri::AppHandle,
        scrollback: String,
    ) -> Result<CollabHostInfo, String> {
        let listener = TcpListener::bind("0.0.0.0:0")
            .await
            .map_err(|e| format!("Failed to bind: {}", e))?;
        let port = listener
            .local_addr()
            .map_err(|e| format!("Failed to get port: {}", e))?
            .port();
        self.port = port;

        let running = Arc::clone(&self.running);
        let guests = Arc::clone(&self.guests);
        let chat_history = Arc::clone(&self.chat_history);
        let session_code = self.session_code.clone();
        let host_name = self.host_name.clone();
        let failed_attempts = Arc::clone(&self.failed_attempts);
        let scrollback = Arc::new(TokioMutex::new(scrollback));
        let cols = self.terminal_cols;
        let rows = self.terminal_rows;

        // Take the PTY broadcast receiver and create a new broadcast for guests
        let mut pty_rx = self
            .pty_rx
            .take()
            .ok_or("PTY broadcast receiver already taken")?;
        let guest_broadcast_tx = broadcast::Sender::<String>::new(256);

        // Task: fan out PTY data to guest broadcast
        let running_pty = Arc::clone(&running);
        let guest_tx_clone = guest_broadcast_tx.clone();
        let scrollback_updater = Arc::clone(&scrollback);
        let app_for_pty = app_handle.clone();
        let pty_sid = self.pty_session_id.clone();

        tokio::spawn(async move {
            loop {
                if !running_pty.load(Ordering::Relaxed) {
                    break;
                }
                match pty_rx.recv().await {
                    Ok(data) => {
                        // Update scrollback for late joiners (keep last 64KB)
                        {
                            let mut sb = scrollback_updater.lock().await;
                            sb.push_str(&data);
                            if sb.len() > 65536 {
                                let mut trim = sb.len() - 65536;
                                while trim < sb.len() && !sb.is_char_boundary(trim) {
                                    trim += 1;
                                }
                                if trim < sb.len() {
                                    *sb = sb[trim..].to_string();
                                }
                            }
                        }
                        // Broadcast to all guests (ignore if no receivers)
                        let _ = guest_tx_clone.send(data);
                    }
                    Err(broadcast::error::RecvError::Lagged(n)) => {
                        eprintln!("[Collab] PTY broadcast lagged by {} messages", n);
                    }
                    Err(broadcast::error::RecvError::Closed) => {
                        // PTY session ended
                        let _ = app_for_pty.emit(
                            &format!("collab-ended-{}", pty_sid),
                            "PTY session closed",
                        );
                        break;
                    }
                }
            }
        });

        // Task: accept incoming WebSocket connections
        let app_for_accept = app_handle.clone();
        let pty_sid_accept = self.pty_session_id.clone();

        tokio::spawn(async move {
            loop {
                if !running.load(Ordering::Relaxed) {
                    break;
                }

                let accept_result = tokio::select! {
                    result = listener.accept() => result,
                    _ = tokio::time::sleep(Duration::from_secs(1)) => continue,
                };

                let (stream, addr) = match accept_result {
                    Ok(s) => s,
                    Err(_) => continue,
                };

                let running_conn = Arc::clone(&running);
                let guests_conn = Arc::clone(&guests);
                let chat_history_conn = Arc::clone(&chat_history);
                let session_code_conn = session_code.clone();
                let host_name_conn = host_name.clone();
                let failed_attempts_conn = Arc::clone(&failed_attempts);
                let scrollback_conn = Arc::clone(&scrollback);
                let app_conn = app_for_accept.clone();
                let pty_sid_conn = pty_sid_accept.clone();
                let mut guest_rx = guest_broadcast_tx.subscribe();
                let addr_str = addr.ip().to_string();

                tokio::spawn(async move {
                    // Rate limiting check (with cleanup of expired entries)
                    {
                        let mut attempts = failed_attempts_conn.lock().await;
                        // Clean up expired entries (older than 120s)
                        attempts.retain(|_, (_, last)| last.elapsed() < Duration::from_secs(120));
                        if let Some((count, last)) = attempts.get(&addr_str) {
                            if *count >= 5 && last.elapsed() < Duration::from_secs(60) {
                                return; // Silently reject
                            }
                        }
                    }

                    let ws_stream = match tokio_tungstenite::accept_async(stream).await {
                        Ok(ws) => ws,
                        Err(_) => return,
                    };

                    let (mut ws_tx, mut ws_rx) = ws_stream.split();

                    // Step 1: Wait for AuthRequest (5 second timeout)
                    let auth_msg = tokio::time::timeout(Duration::from_secs(5), ws_rx.next()).await;

                    let (guest_name, guest_id) = match auth_msg {
                        Ok(Some(Ok(Message::Text(text)))) => {
                            match serde_json::from_str::<CollabMessage>(&text) {
                                Ok(CollabMessage::AuthRequest { code, name }) => {
                                    if code != session_code_conn {
                                        // Record failed attempt
                                        {
                                            let mut attempts =
                                                failed_attempts_conn.lock().await;
                                            let entry = attempts
                                                .entry(addr_str.clone())
                                                .or_insert((0, Instant::now()));
                                            entry.0 += 1;
                                            entry.1 = Instant::now();
                                        }
                                        let resp = CollabMessage::AuthResponse {
                                            ok: false,
                                            error: Some("Invalid session code".to_string()),
                                            scrollback: None,
                                            users: None,
                                            terminal_size: None,
                                        };
                                        let _ = ws_tx
                                            .send(Message::Text(
                                                serde_json::to_string(&resp).unwrap().into(),
                                            ))
                                            .await;
                                        return;
                                    }
                                    let id = uuid::Uuid::new_v4().to_string();
                                    (name, id)
                                }
                                _ => return,
                            }
                        }
                        _ => return,
                    };

                    // Auth success — send scrollback + user list
                    let current_users: Vec<CollabUserInfo> = {
                        let g = guests_conn.read().await;
                        let mut users: Vec<CollabUserInfo> = g
                            .values()
                            .map(|g| CollabUserInfo {
                                id: g.id.clone(),
                                name: g.name.clone(),
                                permission: g.permission.clone(),
                                is_host: false,
                            })
                            .collect();
                        users.insert(
                            0,
                            CollabUserInfo {
                                id: "host".to_string(),
                                name: host_name_conn.clone(),
                                permission: CollabPermission::FullControl,
                                is_host: true,
                            },
                        );
                        users
                    };

                    let sb = scrollback_conn.lock().await.clone();
                    let auth_resp = CollabMessage::AuthResponse {
                        ok: true,
                        error: None,
                        scrollback: Some(sb),
                        users: Some(current_users),
                        terminal_size: Some((cols, rows)),
                    };
                    if ws_tx
                        .send(Message::Text(
                            serde_json::to_string(&auth_resp).unwrap().into(),
                        ))
                        .await
                        .is_err()
                    {
                        return;
                    }

                    // Notify host frontend of new user
                    let new_user = CollabUserInfo {
                        id: guest_id.clone(),
                        name: guest_name.clone(),
                        permission: CollabPermission::ReadOnly,
                        is_host: false,
                    };

                    // Broadcast UserJoined to existing guests
                    let join_msg = CollabMessage::UserJoined {
                        user: new_user.clone(),
                    };
                    let join_json = serde_json::to_string(&join_msg).unwrap();
                    {
                        let mut g = guests_conn.write().await;
                        for other in g.values_mut() {
                            let _ = other
                                .tx
                                .send(Message::Text(join_json.clone().into()))
                                .await;
                        }
                    }

                    let _ = app_conn.emit(
                        &format!("collab-user-joined-{}", pty_sid_conn),
                        &new_user,
                    );

                    // Register this guest
                    {
                        let mut g = guests_conn.write().await;
                        g.insert(
                            guest_id.clone(),
                            Guest {
                                id: guest_id.clone(),
                                name: guest_name.clone(),
                                permission: CollabPermission::ReadOnly,
                                tx: ws_tx,
                            },
                        );
                    }

                    // Main loop: relay PTY data to guest + handle guest messages
                    loop {
                        if !running_conn.load(Ordering::Relaxed) {
                            break;
                        }

                        tokio::select! {
                            // PTY data -> send to this guest
                            pty_data = guest_rx.recv() => {
                                match pty_data {
                                    Ok(data) => {
                                        let msg = CollabMessage::PtyData { data };
                                        let json = serde_json::to_string(&msg).unwrap();
                                        let mut g = guests_conn.write().await;
                                        if let Some(guest) = g.get_mut(&guest_id) {
                                            if guest.tx.send(Message::Text(json.into())).await.is_err() {
                                                break; // Guest disconnected
                                            }
                                        } else {
                                            break; // Guest was kicked
                                        }
                                    }
                                    Err(broadcast::error::RecvError::Lagged(_)) => continue,
                                    Err(broadcast::error::RecvError::Closed) => break,
                                }
                            }
                            // Guest message -> process
                            guest_msg = ws_rx.next() => {
                                match guest_msg {
                                    Some(Ok(Message::Text(text))) => {
                                        let text_str: &str = &text;
                                        match serde_json::from_str::<CollabMessage>(text_str) {
                                            Ok(CollabMessage::PtyInput { data }) => {
                                                // Check permission
                                                let allowed = {
                                                    let g = guests_conn.read().await;
                                                    g.get(&guest_id)
                                                        .map(|g| g.permission == CollabPermission::FullControl)
                                                        .unwrap_or(false)
                                                };
                                                if allowed {
                                                    let _ = app_conn.emit(
                                                        &format!("collab-guest-input-{}", pty_sid_conn),
                                                        &data,
                                                    );
                                                }
                                            }
                                            Ok(CollabMessage::ChatMessage { id, sender: _, content, timestamp: _ }) => {
                                                let chat_msg = CollabMessage::ChatMessage {
                                                    id: id.clone(),
                                                    sender: guest_name.clone(),
                                                    content: content.clone(),
                                                    timestamp: now_unix_ms(),
                                                };
                                                // Save to history
                                                {
                                                    let mut history = chat_history_conn.lock().await;
                                                    history.push(chat_msg.clone());
                                                    if history.len() > 500 {
                                                        history.drain(..100);
                                                    }
                                                }
                                                // Broadcast to all guests
                                                let chat_json = serde_json::to_string(&chat_msg).unwrap();
                                                {
                                                    let mut g = guests_conn.write().await;
                                                    for (gid, guest) in g.iter_mut() {
                                                        if *gid != guest_id {
                                                            let _ = guest.tx.send(Message::Text(chat_json.clone().into())).await;
                                                        }
                                                    }
                                                }
                                                // Notify host frontend
                                                let _ = app_conn.emit(
                                                    &format!("collab-chat-{}", pty_sid_conn),
                                                    &chat_msg,
                                                );
                                            }
                                            Ok(CollabMessage::Heartbeat) => {
                                                let mut g = guests_conn.write().await;
                                                if let Some(guest) = g.get_mut(&guest_id) {
                                                    let _ = guest.tx.send(Message::Text(
                                                        serde_json::to_string(&CollabMessage::Pong).unwrap().into()
                                                    )).await;
                                                }
                                            }
                                            _ => {}
                                        }
                                    }
                                    Some(Ok(Message::Close(_))) | None => break,
                                    _ => {}
                                }
                            }
                        }
                    }

                    // Guest disconnected — cleanup
                    {
                        let mut g = guests_conn.write().await;
                        g.remove(&guest_id);

                        // Notify remaining guests
                        let left_msg = CollabMessage::UserLeft {
                            user_id: guest_id.clone(),
                        };
                        let left_json = serde_json::to_string(&left_msg).unwrap();
                        for other in g.values_mut() {
                            let _ = other.tx.send(Message::Text(left_json.clone().into())).await;
                        }
                    }

                    let _ = app_conn.emit(
                        &format!("collab-user-left-{}", pty_sid_conn),
                        &guest_id,
                    );
                });
            }
        });

        Ok(CollabHostInfo {
            session_code: self.session_code.clone(),
            port,
            local_ips: get_local_ips(),
        })
    }

    /// Change a guest's permission
    pub async fn set_permission(
        &self,
        guest_id: &str,
        permission: CollabPermission,
    ) -> Result<(), String> {
        let mut guests = self.guests.write().await;
        let guest = guests
            .get_mut(guest_id)
            .ok_or_else(|| format!("Guest '{}' not found", guest_id))?;
        guest.permission = permission.clone();

        let msg = CollabMessage::PermissionChanged {
            user_id: guest_id.to_string(),
            permission: permission.clone(),
        };
        let json = serde_json::to_string(&msg).unwrap();

        // Notify the specific guest
        let _ = guest.tx.send(Message::Text(json.clone().into())).await;

        // Notify all other guests
        for (gid, g) in guests.iter_mut() {
            if gid != guest_id {
                let _ = g.tx.send(Message::Text(json.clone().into())).await;
            }
        }

        Ok(())
    }

    /// Kick a guest
    pub async fn kick_guest(&self, guest_id: &str) -> Result<(), String> {
        let mut guests = self.guests.write().await;
        if let Some(mut guest) = guests.remove(guest_id) {
            let msg = CollabMessage::Kicked {
                reason: "Kicked by host".to_string(),
            };
            let _ = guest
                .tx
                .send(Message::Text(
                    serde_json::to_string(&msg).unwrap().into(),
                ))
                .await;
            let _ = guest.tx.close().await;

            // Notify remaining guests
            let left_msg = CollabMessage::UserLeft {
                user_id: guest_id.to_string(),
            };
            let left_json = serde_json::to_string(&left_msg).unwrap();
            for other in guests.values_mut() {
                let _ = other
                    .tx
                    .send(Message::Text(left_json.clone().into()))
                    .await;
            }
            Ok(())
        } else {
            Err(format!("Guest '{}' not found", guest_id))
        }
    }

    /// Send chat from host
    pub async fn host_chat(&self, content: String, host_name: &str) -> Result<(), String> {
        let chat_msg = CollabMessage::ChatMessage {
            id: uuid::Uuid::new_v4().to_string(),
            sender: host_name.to_string(),
            content,
            timestamp: now_unix_ms(),
        };

        {
            let mut history = self.chat_history.lock().await;
            history.push(chat_msg.clone());
            if history.len() > 500 {
                history.drain(..100);
            }
        }

        let json = serde_json::to_string(&chat_msg).unwrap();
        let mut guests = self.guests.write().await;
        for guest in guests.values_mut() {
            let _ = guest.tx.send(Message::Text(json.clone().into())).await;
        }
        Ok(())
    }

    /// Broadcast terminal resize to all guests
    pub async fn broadcast_resize(&self, cols: u16, rows: u16) {
        let msg = CollabMessage::Resize { cols, rows };
        let json = serde_json::to_string(&msg).unwrap();
        let mut guests = self.guests.write().await;
        for guest in guests.values_mut() {
            let _ = guest.tx.send(Message::Text(json.clone().into())).await;
        }
    }

    /// Get connected guest count
    pub async fn guest_count(&self) -> usize {
        self.guests.read().await.len()
    }

    /// Get list of connected users
    pub async fn get_users(&self) -> Vec<CollabUserInfo> {
        let g = self.guests.read().await;
        let mut users = vec![CollabUserInfo {
            id: "host".to_string(),
            name: self.host_name.clone(),
            permission: CollabPermission::FullControl,
            is_host: true,
        }];
        for guest in g.values() {
            users.push(CollabUserInfo {
                id: guest.id.clone(),
                name: guest.name.clone(),
                permission: guest.permission.clone(),
                is_host: false,
            });
        }
        users
    }

    /// Stop the collab session
    pub fn stop(&self) {
        self.running.store(false, Ordering::SeqCst);
    }
}

impl Drop for CollabSession {
    fn drop(&mut self) {
        self.running.store(false, Ordering::SeqCst);
    }
}

// ──────────── Client-side: Join a Collab Session ────────────

pub struct CollabClient {
    pub collab_id: String,
    running: Arc<AtomicBool>,
    tx: Arc<TokioMutex<Option<futures_util::stream::SplitSink<
        tokio_tungstenite::WebSocketStream<
            tokio_tungstenite::MaybeTlsStream<TcpStream>,
        >,
        Message,
    >>>>,
}

impl CollabClient {
    /// Connect to a remote collab session as a guest
    pub async fn connect(
        host_address: &str,
        session_code: &str,
        guest_name: &str,
        app_handle: tauri::AppHandle,
    ) -> Result<(Self, CollabJoinInfo), String> {
        let url = format!("ws://{}", host_address);
        let (ws_stream, _) = tokio_tungstenite::connect_async(&url)
            .await
            .map_err(|e| format!("Connection failed: {}", e))?;

        let (mut ws_tx, mut ws_rx) = ws_stream.split();

        // Send auth request
        let auth_req = CollabMessage::AuthRequest {
            code: session_code.to_string(),
            name: guest_name.to_string(),
        };
        ws_tx
            .send(Message::Text(
                serde_json::to_string(&auth_req).unwrap().into(),
            ))
            .await
            .map_err(|e| format!("Send failed: {}", e))?;

        // Wait for auth response (5s timeout)
        let resp = tokio::time::timeout(Duration::from_secs(5), ws_rx.next())
            .await
            .map_err(|_| "Auth timeout".to_string())?
            .ok_or("Connection closed")?
            .map_err(|e| format!("WebSocket error: {}", e))?;

        let auth_resp = match resp {
            Message::Text(text) => {
                let text_str: &str = &text;
                serde_json::from_str::<CollabMessage>(text_str)
                    .map_err(|e| format!("Invalid response: {}", e))?
            }
            _ => return Err("Unexpected message type".to_string()),
        };

        match auth_resp {
            CollabMessage::AuthResponse {
                ok: true,
                scrollback,
                users,
                terminal_size,
                ..
            } => {
                let collab_id = uuid::Uuid::new_v4().to_string();
                let running = Arc::new(AtomicBool::new(true));
                let tx = Arc::new(TokioMutex::new(Some(ws_tx)));

                // Emit scrollback so frontend can write it to xterm
                if let Some(sb) = &scrollback {
                    let _ = app_handle.emit(
                        &format!("collab-scrollback-{}", collab_id),
                        sb,
                    );
                }

                // Spawn message receiver task
                let running_rx = Arc::clone(&running);
                let app_rx = app_handle.clone();
                let cid = collab_id.clone();

                tokio::spawn(async move {
                    while running_rx.load(Ordering::Relaxed) {
                        match ws_rx.next().await {
                            Some(Ok(Message::Text(text))) => {
                                let text_str: &str = &text;
                                match serde_json::from_str::<CollabMessage>(text_str) {
                                    Ok(CollabMessage::PtyData { data }) => {
                                        let _ = app_rx.emit(
                                            &format!("collab-pty-data-{}", cid),
                                            &data,
                                        );
                                    }
                                    Ok(CollabMessage::ChatMessage { id, sender, content, timestamp }) => {
                                        let _ = app_rx.emit(
                                            &format!("collab-chat-{}", cid),
                                            serde_json::json!({
                                                "id": id,
                                                "sender": sender,
                                                "content": content,
                                                "timestamp": timestamp,
                                            }),
                                        );
                                    }
                                    Ok(CollabMessage::UserJoined { user }) => {
                                        let _ = app_rx.emit(
                                            &format!("collab-user-joined-{}", cid),
                                            &user,
                                        );
                                    }
                                    Ok(CollabMessage::UserLeft { user_id }) => {
                                        let _ = app_rx.emit(
                                            &format!("collab-user-left-{}", cid),
                                            &user_id,
                                        );
                                    }
                                    Ok(CollabMessage::PermissionChanged { user_id, permission }) => {
                                        let _ = app_rx.emit(
                                            &format!("collab-permission-{}", cid),
                                            serde_json::json!({
                                                "userId": user_id,
                                                "permission": permission,
                                            }),
                                        );
                                    }
                                    Ok(CollabMessage::Kicked { reason }) => {
                                        let _ = app_rx.emit(
                                            &format!("collab-kicked-{}", cid),
                                            &reason,
                                        );
                                        break;
                                    }
                                    Ok(CollabMessage::Resize { cols, rows }) => {
                                        let _ = app_rx.emit(
                                            &format!("collab-resize-{}", cid),
                                            serde_json::json!({ "cols": cols, "rows": rows }),
                                        );
                                    }
                                    Ok(CollabMessage::Pong) => {}
                                    _ => {}
                                }
                            }
                            Some(Ok(Message::Close(_))) | None => {
                                let _ = app_rx.emit(
                                    &format!("collab-disconnected-{}", cid),
                                    "Host ended session",
                                );
                                break;
                            }
                            _ => {}
                        }
                    }
                });

                // Spawn heartbeat task
                let running_hb = Arc::clone(&running);
                let tx_hb = Arc::clone(&tx);
                tokio::spawn(async move {
                    loop {
                        tokio::time::sleep(Duration::from_secs(15)).await;
                        if !running_hb.load(Ordering::Relaxed) {
                            break;
                        }
                        let mut guard = tx_hb.lock().await;
                        if let Some(ref mut sender) = *guard {
                            let hb = serde_json::to_string(&CollabMessage::Heartbeat).unwrap();
                            if sender.send(Message::Text(hb.into())).await.is_err() {
                                break;
                            }
                        }
                    }
                });

                let join_info = CollabJoinInfo {
                    collab_id: collab_id.clone(),
                    host_name: "Host".to_string(), // Will be updated from user list
                    permission: CollabPermission::ReadOnly,
                    users: users.unwrap_or_default(),
                    terminal_size: terminal_size.unwrap_or((80, 24)),
                };

                Ok((
                    CollabClient {
                        collab_id,
                        running,
                        tx,
                    },
                    join_info,
                ))
            }
            CollabMessage::AuthResponse {
                ok: false, error, ..
            } => Err(error.unwrap_or_else(|| "Authentication failed".to_string())),
            _ => Err("Unexpected response".to_string()),
        }
    }

    /// Send keyboard input to host
    pub async fn send_input(&self, data: String) -> Result<(), String> {
        let mut guard = self.tx.lock().await;
        if let Some(ref mut sender) = *guard {
            let msg = CollabMessage::PtyInput { data };
            sender
                .send(Message::Text(
                    serde_json::to_string(&msg).unwrap().into(),
                ))
                .await
                .map_err(|e| format!("Send failed: {}", e))
        } else {
            Err("Not connected".to_string())
        }
    }

    /// Send chat message to host
    pub async fn send_chat(&self, content: String, sender_name: &str) -> Result<(), String> {
        let mut guard = self.tx.lock().await;
        if let Some(ref mut ws_sender) = *guard {
            let msg = CollabMessage::ChatMessage {
                id: uuid::Uuid::new_v4().to_string(),
                sender: sender_name.to_string(),
                content,
                timestamp: now_unix_ms(),
            };
            ws_sender
                .send(Message::Text(
                    serde_json::to_string(&msg).unwrap().into(),
                ))
                .await
                .map_err(|e| format!("Send failed: {}", e))
        } else {
            Err("Not connected".to_string())
        }
    }

    /// Disconnect from the collab session
    pub async fn disconnect(&self) {
        self.running.store(false, Ordering::SeqCst);
        let mut guard = self.tx.lock().await;
        if let Some(mut sender) = guard.take() {
            let _ = sender.close().await;
        }
    }
}

impl Drop for CollabClient {
    fn drop(&mut self) {
        self.running.store(false, Ordering::SeqCst);
    }
}
