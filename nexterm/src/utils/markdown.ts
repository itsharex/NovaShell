export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function renderMarkdown(text: string): string {
  let html = escapeHtml(text);
  // Code blocks
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, _lang, code) =>
    `<pre style="background:var(--bg-secondary);padding:8px 10px;border-radius:var(--radius-sm);overflow-x:auto;margin:6px 0;border:1px solid var(--border-subtle);font-family:monospace;font-size:11px;line-height:1.5">${code.trim()}</pre>`
  );
  // Inline code
  html = html.replace(/`([^`]+)`/g,
    `<code style="background:var(--bg-secondary);padding:1px 5px;border-radius:3px;font-family:monospace;font-size:11px">$1</code>`
  );
  // Headers
  html = html.replace(/^### (.+)$/gm, '<h4 style="font-size:13px;color:var(--text-primary);margin:16px 0 6px;font-weight:600">$1</h4>');
  html = html.replace(/^## (.+)$/gm, '<h3 style="font-size:14px;color:var(--text-primary);margin:18px 0 8px;font-weight:600;border-bottom:1px solid var(--border-subtle);padding-bottom:4px">$1</h3>');
  html = html.replace(/^# (.+)$/gm, '<h2 style="font-size:16px;color:var(--text-primary);margin:0 0 12px;font-weight:700">$1</h2>');
  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  // Italic
  html = html.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, "<em>$1</em>");
  // Bullet points
  html = html.replace(/^[-*] (.+)$/gm,
    '<div style="display:flex;gap:6px;align-items:baseline"><span style="color:var(--accent-primary)">&#8226;</span><span>$1</span></div>'
  );
  // Numbered lists
  html = html.replace(/^(\d+)\. (.+)$/gm,
    '<div style="display:flex;gap:6px;align-items:baseline;margin:2px 0"><span style="color:var(--accent-primary);min-width:16px">$1.</span><span>$2</span></div>'
  );
  return html;
}
