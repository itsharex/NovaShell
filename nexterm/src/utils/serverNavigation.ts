import { useAppStore, type SSHConnection } from "../store/appStore";

// Pattern 1: cd server:/path (colon syntax)
const SERVER_NAV_PATTERN = /^cd\s+(@?[\w.-]+):(.*)$/;

// Pattern 2: cd /servers/webserver/var/www (filesystem global syntax)
const SERVERS_FS_PATTERN = /^cd\s+\/servers\/([^/\s]+)(\/.*)?$/;

// Pattern 3: ls /servers (list available servers)
const LIST_SERVERS_PATTERN = /^ls\s+\/servers\s*$/;

/**
 * Check if a command is a cross-server navigation command
 */
export function isServerNavCommand(cmd: string): boolean {
  const trimmed = cmd.trim();
  return (
    SERVER_NAV_PATTERN.test(trimmed) ||
    SERVERS_FS_PATTERN.test(trimmed) ||
    LIST_SERVERS_PATTERN.test(trimmed)
  );
}

/**
 * Parse a cross-server navigation command.
 * Supports:
 *   cd webserver:/var/www        → { serverName: "webserver", path: "/var/www" }
 *   cd /servers/webserver/var/www → { serverName: "webserver", path: "/var/www" }
 *   cd /servers/local/home        → { serverName: "local", path: "/home" }
 *   ls /servers                   → { serverName: "__list__", path: "" }
 */
export function parseServerNavCommand(cmd: string): { serverName: string; path: string } | null {
  const trimmed = cmd.trim();

  // ls /servers → special listing command
  if (LIST_SERVERS_PATTERN.test(trimmed)) {
    return { serverName: "__list__", path: "" };
  }

  // cd /servers/name/path... → filesystem-style
  const fsMatch = trimmed.match(SERVERS_FS_PATTERN);
  if (fsMatch) {
    return {
      serverName: fsMatch[1].replace(/^@/, ""),
      path: fsMatch[2] || "~",
    };
  }

  // cd name:/path → colon syntax
  const colonMatch = trimmed.match(SERVER_NAV_PATTERN);
  if (colonMatch) {
    return {
      serverName: colonMatch[1].replace(/^@/, ""),
      path: colonMatch[2] || "~",
    };
  }

  return null;
}

/**
 * Build the virtual /servers directory listing for `ls /servers`
 */
export function listServers(): string {
  const connections = useAppStore.getState().sshConnections;
  const lines: string[] = [];
  lines.push("\x1b[1;36m/servers\x1b[0m — NovaShell Virtual Server Filesystem");
  lines.push("");
  lines.push("  \x1b[1;34mlocal/\x1b[0m              \x1b[90m← your machine\x1b[0m");
  for (const c of connections) {
    const status =
      c.status === "connected"
        ? "\x1b[32mconnected\x1b[0m"
        : c.status === "connecting"
          ? "\x1b[33mconnecting...\x1b[0m"
          : "\x1b[90mdisconnected\x1b[0m";
    const name = c.name.padEnd(20);
    lines.push(`  \x1b[1;34m${name}\x1b[0m ${status}  \x1b[90m${c.username}@${c.host}:${c.port}\x1b[0m`);
  }
  lines.push("");
  lines.push("\x1b[90mUsage:  cd /servers/webserver/var/www\x1b[0m");
  lines.push("\x1b[90m        cd webserver:/var/www\x1b[0m");
  lines.push("\x1b[90m        cd local:~\x1b[0m");
  return lines.join("\r\n");
}

/**
 * Resolve a server name to an SSHConnection or "local"
 * Matches by: name (case-insensitive), host, or id
 */
export function resolveServer(name: string): SSHConnection | "local" | null {
  if (name.toLowerCase() === "local") return "local";

  const connections = useAppStore.getState().sshConnections;
  const lower = name.toLowerCase();

  // Match by name (case-insensitive)
  const byName = connections.find((c) => c.name.toLowerCase() === lower);
  if (byName) return byName;

  // Match by host
  const byHost = connections.find((c) => c.host.toLowerCase() === lower);
  if (byHost) return byHost;

  // Match by id
  const byId = connections.find((c) => c.id === name);
  if (byId) return byId;

  return null;
}

/**
 * Get credentials for a connection.
 * Tries: sessionPassword → keychain → null (needs prompt)
 */
export async function getConnectionCredentials(
  conn: SSHConnection,
): Promise<{ password?: string; privateKey?: string } | null> {
  // If has private key, use that
  if (conn.privateKey) {
    return { privateKey: conn.privateKey, password: conn.sessionPassword || undefined };
  }

  // If has session password (in-memory)
  if (conn.sessionPassword) {
    return { password: conn.sessionPassword };
  }

  // Try keychain
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const pwd = await invoke<string>("keychain_get_password", { connectionId: conn.id });
    if (pwd) return { password: pwd };
  } catch {
    // No keychain password
  }

  // No credentials available — caller needs to prompt
  return null;
}

/**
 * Execute the server navigation: connect to target server and cd to path.
 * Returns the new sessionId or throws an error message.
 */
export async function navigateToServer(
  conn: SSHConnection,
  path: string,
  credentials: { password?: string; privateKey?: string },
): Promise<string> {
  const { invoke } = await import("@tauri-apps/api/core");

  // If already connected, reuse session
  if (conn.status === "connected" && conn.sessionId) {
    // Just cd to the new path on the existing session
    await invoke("ssh_write", { sessionId: conn.sessionId, data: `cd ${path}\r` });
    return conn.sessionId;
  }

  // Connect to server
  const sessionId = await invoke<string>("ssh_connect", {
    host: conn.host,
    port: conn.port,
    username: conn.username,
    password: credentials.password || null,
    privateKey: credentials.privateKey || null,
  });

  // Update connection status in store
  useAppStore.getState().updateSSHConnection(conn.id, {
    status: "connected",
    sessionId,
    sessionPassword: credentials.password,
  });

  // Wait for shell to initialize by listening for first data event,
  // with a fallback timeout to avoid hanging forever
  const { listen } = await import("@tauri-apps/api/event");
  await new Promise<void>((resolve) => {
    let done = false;
    const timeout = setTimeout(() => { if (!done) { done = true; resolve(); } }, 3000);
    listen<string>(`ssh-data-${sessionId}`, () => {
      if (!done) { done = true; clearTimeout(timeout); resolve(); }
    }).then((unlisten) => {
      if (done) unlisten();
      else setTimeout(() => unlisten(), 3500);
    }).catch(() => {
      // listen() failed — resolve anyway so navigation isn't blocked
      if (!done) { done = true; clearTimeout(timeout); resolve(); }
    });
  });
  await invoke("ssh_write", { sessionId, data: `cd ${path}\r` });

  return sessionId;
}
