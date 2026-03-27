/** File extension color mapping — shared by EditorPanel and FileExplorer */
export const EXT_COLORS: Record<string, string> = {
  js: "#f7df1e", ts: "#3178c6", tsx: "#3178c6", jsx: "#61dafb",
  json: "#a8b1ff", md: "#519aba", css: "#563d7c", html: "#e34f26",
  py: "#3572A5", rs: "#dea584", go: "#00ADD8", java: "#b07219",
  yaml: "#cb171e", yml: "#cb171e", toml: "#9c4221", csv: "#237346",
  sh: "#89e051", bash: "#89e051", ps1: "#012456", bat: "#c1f12e",
  txt: "var(--text-muted)", log: "var(--accent-warning)",
  png: "#a259ff", jpg: "#a259ff", svg: "#ff9a00", gif: "#a259ff",
  exe: "var(--accent-error)", dll: "var(--accent-error)",
  lock: "var(--text-muted)", gitignore: "#f05032",
};

export function getExtColor(ext: string): string {
  return EXT_COLORS[ext.toLowerCase()] || "var(--text-secondary)";
}

export function formatSize(bytes: number, showZero = false): string {
  if (bytes === 0) return showZero ? "0 B" : "";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}
