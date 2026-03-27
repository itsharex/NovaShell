/** Terminal theme color definitions — shared by TerminalPanel and SSHPanel */
export const themeColors: Record<string, Record<string, string>> = {
  dark: {
    background: "#0d1117", foreground: "#e6edf3", cursor: "#58a6ff", cursorAccent: "#0d1117",
    selectionBackground: "rgba(88,166,255,0.4)", selectionForeground: "#ffffff",
    black: "#484f58", red: "#ff7b72", green: "#3fb950", yellow: "#d29922",
    blue: "#58a6ff", magenta: "#bc8cff", cyan: "#39d2c0", white: "#b1bac4",
    brightBlack: "#6e7681", brightRed: "#ffa198", brightGreen: "#56d364", brightYellow: "#e3b341",
    brightBlue: "#79c0ff", brightMagenta: "#d2a8ff", brightCyan: "#56d4dd", brightWhite: "#f0f6fc",
  },
  light: {
    background: "#ffffff", foreground: "#1f2328", cursor: "#0969da", cursorAccent: "#ffffff",
    selectionBackground: "rgba(9,105,218,0.35)", selectionForeground: "#000000",
    black: "#24292f", red: "#cf222e", green: "#1a7f37", yellow: "#9a6700",
    blue: "#0969da", magenta: "#8250df", cyan: "#1b7c83", white: "#6e7781",
    brightBlack: "#57606a", brightRed: "#a40e26", brightGreen: "#2da44e", brightYellow: "#bf8700",
    brightBlue: "#218bff", brightMagenta: "#a475f9", brightCyan: "#3192aa", brightWhite: "#8c959f",
  },
  cyberpunk: {
    background: "#0a0a1a", foreground: "#00ffcc", cursor: "#00ffcc", cursorAccent: "#0a0a1a",
    selectionBackground: "rgba(0,255,204,0.35)", selectionForeground: "#ffffff",
    black: "#333366", red: "#ff3366", green: "#00ffcc", yellow: "#ffcc00",
    blue: "#3399ff", magenta: "#cc66ff", cyan: "#00ccff", white: "#ccccff",
    brightBlack: "#666699", brightRed: "#ff6699", brightGreen: "#33ffdd", brightYellow: "#ffdd33",
    brightBlue: "#66bbff", brightMagenta: "#dd88ff", brightCyan: "#33ddff", brightWhite: "#eeeeff",
  },
  retro: {
    background: "#1b2b1b", foreground: "#33ff33", cursor: "#33ff33", cursorAccent: "#1b2b1b",
    selectionBackground: "rgba(51,255,51,0.35)", selectionForeground: "#ffffff",
    black: "#0a150a", red: "#ff3333", green: "#33ff33", yellow: "#ccff33",
    blue: "#33ccff", magenta: "#33ffcc", cyan: "#66ff66", white: "#99cc99",
    brightBlack: "#448844", brightRed: "#ff6666", brightGreen: "#66ff66", brightYellow: "#ddff66",
    brightBlue: "#66ddff", brightMagenta: "#66ffdd", brightCyan: "#88ff88", brightWhite: "#ccffcc",
  },
  hacking: {
    background: "#050510", foreground: "#00ff41", cursor: "#00ff41", cursorAccent: "#050510",
    selectionBackground: "rgba(0,255,65,0.3)", selectionForeground: "#ffffff",
    black: "#0a0a1a", red: "#ff0040", green: "#00ff41", yellow: "#ffaf00",
    blue: "#00d4ff", magenta: "#ff00ff", cyan: "#00ffff", white: "#b0ffb0",
    brightBlack: "#333355", brightRed: "#ff3366", brightGreen: "#39ff14", brightYellow: "#ffd700",
    brightBlue: "#00e5ff", brightMagenta: "#ff44ff", brightCyan: "#44ffff", brightWhite: "#e0ffe0",
  },
};
