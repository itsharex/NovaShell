import { useState, useCallback } from "react";
import { Wifi, Globe, Calculator, Search, Copy, Check, Radio, Server } from "lucide-react";
import { useT } from "../../i18n";
import { useAppStore } from "../../store/appStore";

type NetTab = "sweep" | "wifi" | "subnet" | "dns";

const netTabDefs: { id: NetTab; icon: typeof Wifi; labelKey: string }[] = [
  { id: "sweep", icon: Radio, labelKey: "hacking.pingSweep" },
  { id: "wifi", icon: Wifi, labelKey: "hacking.wifiScan" },
  { id: "subnet", icon: Calculator, labelKey: "hacking.subnetCalc" },
  { id: "dns", icon: Globe, labelKey: "hacking.dnsLookup" },
];

let invokeCache: typeof import("@tauri-apps/api/core")["invoke"] | null = null;
async function getInvoke() {
  if (!invokeCache) invokeCache = (await import("@tauri-apps/api/core")).invoke;
  return invokeCache;
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      style={{ background: "none", border: "none", color: copied ? "#00ff41" : "var(--text-muted)", cursor: "pointer", padding: 2 }}
    >
      {copied ? <Check size={10} /> : <Copy size={10} />}
    </button>
  );
}

// ── Ping Sweep ──

interface SweepResult { ip: string; alive: boolean; latency_ms: number; open_port: number; }

function PingSweepTool() {
  const t = useT();
  const addLog = useAppStore.getState().addHackingLog;
  const [subnet, setSubnet] = useState("192.168.1");
  const [results, setResults] = useState<SweepResult[]>([]);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");

  const runSweep = useCallback(async () => {
    setScanning(true);
    setError("");
    setResults([]);
    addLog({ level: "recon", message: `Ping sweep: ${subnet}.0/24`, source: "network", category: "network" });
    try {
      const invoke = await getInvoke();
      const res = await invoke<SweepResult[]>("hacking_ping_sweep", { subnet });
      setResults(res);
      addLog({ level: "success", message: `Sweep complete: ${res.length} hosts alive`, source: "network", category: "network" });
    } catch (e: any) {
      setError(e?.toString() || "Sweep failed");
    }
    setScanning(false);
  }, [subnet]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 6 }}>
        <input
          value={subnet}
          onChange={(e) => setSubnet(e.target.value)}
          placeholder={t("hacking.subnetInput")}
          style={{
            flex: 1, background: "var(--bg-primary)", border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-sm)", color: "var(--text-primary)",
            padding: "4px 8px", fontSize: 11, fontFamily: "'JetBrains Mono', monospace", outline: "none",
          }}
        />
        <button
          onClick={runSweep}
          disabled={scanning}
          style={{
            background: scanning ? "var(--bg-active)" : "var(--accent-primary)",
            border: "none", borderRadius: "var(--radius-sm)",
            color: scanning ? "var(--text-muted)" : "#000",
            padding: "4px 12px", fontSize: 10, fontWeight: 700, cursor: scanning ? "default" : "pointer",
          }}
        >
          <Radio size={10} style={{ marginRight: 4, verticalAlign: "middle" }} />
          {scanning ? t("hacking.sweeping") : t("hacking.sweep")}
        </button>
      </div>

      {error && <div style={{ color: "#ff6080", fontSize: 10 }}>{error}</div>}

      {results.length > 0 && (
        <div style={{
          border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-sm)",
          overflow: "hidden",
        }}>
          <div style={{
            display: "flex", padding: "4px 8px", fontSize: 9, fontWeight: 700,
            color: "var(--text-muted)", background: "var(--bg-primary)",
            borderBottom: "1px solid var(--border-subtle)",
          }}>
            <span style={{ flex: 2 }}>IP</span>
            <span style={{ width: 60, textAlign: "right" }}>Latency</span>
            <span style={{ width: 60, textAlign: "right" }}>Port</span>
          </div>
          {results.map((r) => (
            <div key={r.ip} style={{
              display: "flex", padding: "3px 8px", fontSize: 10, alignItems: "center",
              borderBottom: "1px solid var(--border-subtle)",
            }}>
              <span style={{ flex: 2, color: "#00ff41", fontFamily: "monospace" }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#00ff41", display: "inline-block", marginRight: 6, boxShadow: "0 0 4px #00ff41" }} />
                {r.ip}
              </span>
              <span style={{ width: 60, textAlign: "right", color: "var(--text-secondary)", fontFamily: "monospace", fontSize: 9 }}>
                {r.latency_ms}ms
              </span>
              <span style={{ width: 60, textAlign: "right", color: "var(--accent-primary)", fontFamily: "monospace", fontSize: 9 }}>
                :{r.open_port}
              </span>
            </div>
          ))}
          <div style={{ padding: "4px 8px", fontSize: 9, color: "var(--text-muted)", background: "var(--bg-primary)" }}>
            {results.length} {t("hacking.hostsAlive")}
          </div>
        </div>
      )}

      {!scanning && results.length === 0 && !error && (
        <div style={{ fontSize: 10, color: "var(--text-muted)", textAlign: "center", padding: 20 }}>
          {t("hacking.sweepHint")}
        </div>
      )}
    </div>
  );
}

// ── WiFi Scanner ──

interface WifiNet { ssid: string; bssid: string; signal_percent: number; channel: number; auth: string; encryption: string; }

function WifiScanTool() {
  const t = useT();
  const [networks, setNetworks] = useState<WifiNet[]>([]);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");

  const scan = useCallback(async () => {
    setScanning(true);
    setError("");
    try {
      const invoke = await getInvoke();
      const res = await invoke<WifiNet[]>("hacking_wifi_scan");
      setNetworks(res);
    } catch (e: any) {
      setError(e?.toString() || "Scan failed");
    }
    setScanning(false);
  }, []);

  const signalColor = (pct: number) => pct > 70 ? "#00ff41" : pct > 40 ? "#d29922" : "#ff4444";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <button
        onClick={scan}
        disabled={scanning}
        style={{
          background: scanning ? "var(--bg-active)" : "var(--accent-primary)",
          border: "none", borderRadius: "var(--radius-sm)",
          color: scanning ? "var(--text-muted)" : "#000",
          padding: "5px 12px", fontSize: 10, fontWeight: 700, cursor: scanning ? "default" : "pointer",
        }}
      >
        <Wifi size={10} style={{ marginRight: 4, verticalAlign: "middle" }} />
        {scanning ? t("common.loading") : t("hacking.scanWifi")}
      </button>

      {error && <div style={{ color: "#ff6080", fontSize: 10 }}>{error}</div>}

      {networks.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {networks.map((n, i) => (
            <div key={`${n.bssid}-${i}`} style={{
              background: "var(--bg-tertiary)", border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-sm)", padding: "6px 8px",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <Wifi size={11} style={{ color: signalColor(n.signal_percent) }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-primary)", flex: 1 }}>
                  {n.ssid || "(Hidden)"}
                </span>
                <span style={{ fontSize: 10, fontWeight: 700, color: signalColor(n.signal_percent), fontFamily: "monospace" }}>
                  {n.signal_percent}%
                </span>
              </div>
              {/* Signal bar */}
              <div style={{ height: 3, background: "var(--bg-primary)", borderRadius: 2, marginBottom: 4 }}>
                <div style={{ height: "100%", width: `${n.signal_percent}%`, background: signalColor(n.signal_percent), borderRadius: 2 }} />
              </div>
              <div style={{ display: "flex", gap: 8, fontSize: 9, color: "var(--text-muted)" }}>
                <span>BSSID: <span style={{ color: "var(--text-secondary)", fontFamily: "monospace" }}>{n.bssid}</span></span>
                <span>CH: <span style={{ color: "var(--text-secondary)" }}>{n.channel}</span></span>
              </div>
              <div style={{ display: "flex", gap: 8, fontSize: 9, color: "var(--text-muted)", marginTop: 2 }}>
                <span>{n.auth}</span>
                <span>{n.encryption}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {!scanning && networks.length === 0 && !error && (
        <div style={{ fontSize: 10, color: "var(--text-muted)", textAlign: "center", padding: 20 }}>
          {t("hacking.wifiHint")}
        </div>
      )}
    </div>
  );
}

// ── Subnet Calculator ──

interface SubnetResult {
  network: string; broadcast: string; first_host: string; last_host: string;
  usable_hosts: number; cidr: number; netmask: string; wildcard: string;
  ip_class: string; is_private: boolean;
}

function SubnetCalcTool() {
  const t = useT();
  const [ip, setIp] = useState("192.168.1.0");
  const [cidr, setCidr] = useState(24);
  const [result, setResult] = useState<SubnetResult | null>(null);
  const [error, setError] = useState("");

  const calculate = useCallback(async () => {
    setError("");
    try {
      const invoke = await getInvoke();
      const res = await invoke<SubnetResult>("hacking_subnet_calc", { ip, cidr });
      setResult(res);
    } catch (e: any) {
      setError(e?.toString() || "Error");
      setResult(null);
    }
  }, [ip, cidr]);

  const Row = ({ label, value }: { label: string; value: string }) => (
    <div style={{ display: "flex", alignItems: "center", padding: "3px 0", borderBottom: "1px solid var(--border-subtle)" }}>
      <span style={{ flex: 1, fontSize: 10, color: "var(--text-muted)" }}>{label}</span>
      <span style={{ fontSize: 10, fontFamily: "monospace", color: "var(--text-primary)", fontWeight: 600 }}>{value}</span>
      <CopyBtn text={value} />
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 6 }}>
        <input
          value={ip}
          onChange={(e) => setIp(e.target.value)}
          placeholder="192.168.1.0"
          style={{
            flex: 1, background: "var(--bg-primary)", border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-sm)", color: "var(--text-primary)",
            padding: "4px 8px", fontSize: 11, fontFamily: "'JetBrains Mono', monospace", outline: "none",
          }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 700 }}>/</span>
          <input
            type="number"
            min={0}
            max={32}
            value={cidr}
            onChange={(e) => setCidr(Math.min(32, Math.max(0, parseInt(e.target.value) || 0)))}
            style={{
              width: 42, background: "var(--bg-primary)", border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-sm)", color: "var(--text-primary)",
              padding: "4px 6px", fontSize: 11, fontFamily: "'JetBrains Mono', monospace", outline: "none", textAlign: "center",
            }}
          />
        </div>
        <button
          onClick={calculate}
          style={{
            background: "var(--accent-primary)", border: "none", borderRadius: "var(--radius-sm)",
            color: "#000", padding: "4px 12px", fontSize: 10, fontWeight: 700, cursor: "pointer",
          }}
        >
          <Calculator size={10} style={{ marginRight: 4, verticalAlign: "middle" }} />
          {t("hacking.calc")}
        </button>
      </div>

      {/* CIDR slider */}
      <input
        type="range"
        min={0}
        max={32}
        value={cidr}
        onChange={(e) => { setCidr(parseInt(e.target.value)); }}
        style={{ width: "100%", accentColor: "var(--accent-primary)" }}
      />

      {error && <div style={{ color: "#ff6080", fontSize: 10 }}>{error}</div>}

      {result && (
        <div style={{
          background: "var(--bg-tertiary)", border: "1px solid var(--border-subtle)",
          borderRadius: "var(--radius-sm)", padding: "8px 10px",
        }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            <span style={{
              padding: "2px 8px", borderRadius: 8, fontSize: 9, fontWeight: 700,
              background: result.is_private ? "rgba(0,255,65,0.1)" : "rgba(255,175,0,0.1)",
              color: result.is_private ? "#00ff41" : "#ffaf00",
              border: `1px solid ${result.is_private ? "rgba(0,255,65,0.3)" : "rgba(255,175,0,0.3)"}`,
            }}>
              {result.is_private ? "Private" : "Public"}
            </span>
            <span style={{ padding: "2px 8px", borderRadius: 8, fontSize: 9, fontWeight: 700, background: "var(--bg-active)", color: "var(--text-secondary)" }}>
              Class {result.ip_class}
            </span>
          </div>
          <Row label={t("hacking.networkAddr")} value={`${result.network}/${result.cidr}`} />
          <Row label={t("hacking.netmask")} value={result.netmask} />
          <Row label={t("hacking.wildcard")} value={result.wildcard} />
          <Row label={t("hacking.broadcast")} value={result.broadcast} />
          <Row label={t("hacking.firstHost")} value={result.first_host} />
          <Row label={t("hacking.lastHost")} value={result.last_host} />
          <Row label={t("hacking.usableHosts")} value={result.usable_hosts.toLocaleString()} />
        </div>
      )}
    </div>
  );
}

// ── DNS Lookup ──

interface DnsRes {
  domain: string; a_records: string[]; aaaa_records: string[]; mx_records: string[];
  ns_records: string[]; txt_records: string[]; soa_record: string; reverse_dns: string[];
}

function DnsLookupTool() {
  const t = useT();
  const addLog = useAppStore.getState().addHackingLog;
  const [domain, setDomain] = useState("");
  const [result, setResult] = useState<DnsRes | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const lookup = useCallback(async () => {
    if (!domain.trim()) return;
    setLoading(true);
    setError("");
    addLog({ level: "recon", message: `DNS enum: ${domain}`, source: "network", category: "network" });
    try {
      const invoke = await getInvoke();
      const res = await invoke<DnsRes>("hacking_dns_enum", { domain: domain.trim() });
      setResult(res);
      addLog({ level: "success", message: `DNS: ${res.a_records.length} A, ${res.mx_records.length} MX, ${res.ns_records.length} NS`, source: "network", category: "network" });
    } catch (e: any) {
      setError(e?.toString() || "Lookup failed");
    }
    setLoading(false);
  }, [domain]);

  const RecordSection = ({ title, records, color }: { title: string; records: string[]; color: string }) => {
    if (records.length === 0) return null;
    return (
      <div style={{ marginBottom: 6 }}>
        <div style={{ fontSize: 9, fontWeight: 700, color, marginBottom: 2 }}>{title}</div>
        {records.map((r, i) => (
          <div key={i} style={{
            display: "flex", alignItems: "center", gap: 4,
            padding: "2px 8px", fontSize: 10, fontFamily: "monospace",
            color: "var(--text-primary)", background: "var(--bg-primary)",
            borderRadius: "var(--radius-sm)", marginBottom: 2,
          }}>
            <span style={{ flex: 1 }}>{r}</span>
            <CopyBtn text={r} />
          </div>
        ))}
      </div>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 6 }}>
        <input
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          placeholder={t("hacking.domainInput")}
          onKeyDown={(e) => e.key === "Enter" && lookup()}
          style={{
            flex: 1, background: "var(--bg-primary)", border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-sm)", color: "var(--text-primary)",
            padding: "4px 8px", fontSize: 11, fontFamily: "'JetBrains Mono', monospace", outline: "none",
          }}
        />
        <button
          onClick={lookup}
          disabled={loading || !domain.trim()}
          style={{
            background: domain.trim() ? "var(--accent-primary)" : "var(--bg-active)",
            border: "none", borderRadius: "var(--radius-sm)",
            color: domain.trim() ? "#000" : "var(--text-muted)",
            padding: "4px 12px", fontSize: 10, fontWeight: 700, cursor: domain.trim() ? "pointer" : "default",
          }}
        >
          <Search size={10} style={{ marginRight: 4, verticalAlign: "middle" }} />
          {loading ? t("common.loading") : t("hacking.lookup")}
        </button>
      </div>

      {error && <div style={{ color: "#ff6080", fontSize: 10 }}>{error}</div>}

      {result && (
        <div style={{
          background: "var(--bg-tertiary)", border: "1px solid var(--border-subtle)",
          borderRadius: "var(--radius-sm)", padding: "8px 10px",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
            <Globe size={12} style={{ color: "var(--accent-primary)" }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>{result.domain}</span>
          </div>
          <RecordSection title={t("hacking.aRecords")} records={result.a_records} color="#00ff41" />
          <RecordSection title={t("hacking.aaaaRecords")} records={result.aaaa_records} color="#00d4ff" />
          <RecordSection title={t("hacking.mxRecords")} records={result.mx_records} color="#d29922" />
          <RecordSection title={t("hacking.nsRecords")} records={result.ns_records} color="#ff6080" />
          <RecordSection title={t("hacking.txtRecords")} records={result.txt_records} color="#b388ff" />
          {result.soa_record && (
            <RecordSection title={t("hacking.soaRecord")} records={[result.soa_record]} color="var(--text-muted)" />
          )}
          {result.reverse_dns.length > 0 && (
            <RecordSection title={t("hacking.reverseDns")} records={result.reverse_dns} color="#58a6ff" />
          )}
        </div>
      )}

      {!loading && !result && !error && (
        <div style={{ fontSize: 10, color: "var(--text-muted)", textAlign: "center", padding: 20 }}>
          {t("hacking.dnsHint")}
        </div>
      )}
    </div>
  );
}

// ── Main NetworkView ──

export function NetworkView() {
  const t = useT();
  const [activeTab, setActiveTab] = useState<NetTab>("sweep");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 4 }}>
        {netTabDefs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
              gap: 4, padding: "4px 6px", fontSize: 10, fontWeight: 600, borderRadius: 8,
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
      <div>
        {activeTab === "sweep" && <PingSweepTool />}
        {activeTab === "wifi" && <WifiScanTool />}
        {activeTab === "subnet" && <SubnetCalcTool />}
        {activeTab === "dns" && <DnsLookupTool />}
      </div>
    </div>
  );
}
