import { create } from "zustand";

export type ThemeName = "dark" | "light" | "cyberpunk" | "retro";
export type SidebarTab = "history" | "snippets" | "preview" | "plugins" | "stats";

interface Tab {
  id: string;
  title: string;
  shellType: string;
  sessionId: string | null;
}

interface Snippet {
  id: string;
  name: string;
  command: string;
  icon?: string;
}

interface HistoryEntry {
  id: string;
  command: string;
  timestamp: number;
  shell: string;
  exitCode?: number;
}

export interface PluginEntry {
  id: string;
  name: string;
  desc: string;
  enabled: boolean;
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  unlocked: boolean;
  unlockedAt?: number;
}

interface AppState {
  theme: ThemeName;
  themesVisited: string[];
  setTheme: (theme: ThemeName) => void;

  tabs: Tab[];
  activeTabId: string;
  addTab: (shell?: string) => void;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  updateTab: (id: string, updates: Partial<Tab>) => void;

  sidebarOpen: boolean;
  sidebarTab: SidebarTab;
  toggleSidebar: () => void;
  setSidebarTab: (tab: SidebarTab) => void;

  focusMode: boolean;
  toggleFocusMode: () => void;

  history: HistoryEntry[];
  addHistory: (entry: Omit<HistoryEntry, "id" | "timestamp">) => void;
  clearHistory: () => void;

  snippets: Snippet[];
  addSnippet: (snippet: Omit<Snippet, "id">) => void;
  removeSnippet: (id: string) => void;

  systemStats: {
    cpu: number;
    memoryUsed: number;
    memoryTotal: number;
    memoryPercent: number;
    processes: number;
  } | null;
  setSystemStats: (stats: AppState["systemStats"]) => void;

  sessionStartTime: number;
  commandCount: number;
  errorCount: number;
  incrementCommandCount: () => void;
  incrementErrorCount: () => void;

  executeSnippet: ((command: string) => void) | null;
  setExecuteSnippet: (fn: ((command: string) => void) | null) => void;

  plugins: PluginEntry[];
  togglePlugin: (id: string) => void;

  gitBranch: string;
  setGitBranch: (branch: string) => void;

  searchOpen: boolean;
  toggleSearch: () => void;

  suggestions: string[];
  setSuggestions: (s: string[]) => void;

  previewFile: { name: string; content: string; extension: string } | null;
  setPreviewFile: (file: AppState["previewFile"]) => void;

  splitMode: "none" | "horizontal" | "vertical";
  setSplitMode: (mode: AppState["splitMode"]) => void;

  achievements: Achievement[];
  checkAchievements: () => void;
}

let tabCounter = 0;

export const useAppStore = create<AppState>((set, get) => ({
  theme: "dark",
  themesVisited: ["dark"] as string[],
  setTheme: (theme) => set((s) => {
    const visited = s.themesVisited.includes(theme) ? s.themesVisited : [...s.themesVisited, theme];
    const achievements = visited.length >= 4
      ? s.achievements.map((a) => a.id === "theme-switcher" && !a.unlocked ? { ...a, unlocked: true, unlockedAt: Date.now() } : a)
      : s.achievements;
    return { theme, themesVisited: visited, achievements };
  }),

  tabs: [{ id: "tab-0", title: "Terminal 1", shellType: "powershell", sessionId: null }],
  activeTabId: "tab-0",

  addTab: (shell = "powershell") => {
    tabCounter++;
    const id = `tab-${tabCounter}`;
    set((s) => ({
      tabs: [...s.tabs, { id, title: `Terminal ${s.tabs.length + 1}`, shellType: shell, sessionId: null }],
      activeTabId: id,
    }));
  },

  closeTab: (id) => {
    const { tabs, activeTabId } = get();
    if (tabs.length <= 1) return;
    const idx = tabs.findIndex((t) => t.id === id);
    const newTabs = tabs.filter((t) => t.id !== id);
    const newActive = activeTabId === id
      ? newTabs[Math.min(idx, newTabs.length - 1)].id
      : activeTabId;
    set({ tabs: newTabs, activeTabId: newActive });
  },

  setActiveTab: (id) => set({ activeTabId: id }),

  updateTab: (id, updates) =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    })),

  sidebarOpen: false,
  sidebarTab: "history",
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarTab: (tab) => set({ sidebarTab: tab, sidebarOpen: true }),

  focusMode: false,
  toggleFocusMode: () => set((s) => ({ focusMode: !s.focusMode })),

  history: [],
  addHistory: (entry) =>
    set((s) => ({
      history: [
        { ...entry, id: crypto.randomUUID(), timestamp: Date.now() },
        ...s.history,
      ].slice(0, 500),
    })),
  clearHistory: () => set({ history: [] }),

  snippets: [
    { id: "s1", name: "Git Status", command: "git status", icon: "git-branch" },
    { id: "s2", name: "List Files", command: "ls -la", icon: "folder" },
    { id: "s3", name: "Docker PS", command: "docker ps", icon: "container" },
    { id: "s4", name: "NPM Install", command: "npm install", icon: "package" },
  ],
  addSnippet: (snippet) =>
    set((s) => ({
      snippets: [...s.snippets, { ...snippet, id: crypto.randomUUID() }],
      achievements: s.achievements.map((a) =>
        a.id === "snippet-creator" && !a.unlocked ? { ...a, unlocked: true, unlockedAt: Date.now() } : a
      ),
    })),
  removeSnippet: (id) =>
    set((s) => ({ snippets: s.snippets.filter((sn) => sn.id !== id) })),

  systemStats: null,
  setSystemStats: (stats) => set({ systemStats: stats }),

  sessionStartTime: Date.now(),
  commandCount: 0,
  errorCount: 0,
  incrementCommandCount: () => set((s) => ({ commandCount: s.commandCount + 1 })),
  incrementErrorCount: () => set((s) => ({ errorCount: s.errorCount + 1 })),

  executeSnippet: null,
  setExecuteSnippet: (fn) => set({ executeSnippet: fn }),

  plugins: [
    { id: "git", name: "Git Integration", desc: "Branch, status, diff viewer", enabled: true },
    { id: "docker", name: "Docker", desc: "Container management & logs", enabled: true },
    { id: "k8s", name: "Kubernetes", desc: "Pod management & monitoring", enabled: false },
    { id: "python", name: "Python REPL", desc: "Inline Python execution", enabled: true },
    { id: "node", name: "Node.js Tools", desc: "NPM scripts, package info", enabled: false },
    { id: "ssh", name: "SSH Manager", desc: "Saved connections & tunnels", enabled: false },
  ],
  togglePlugin: (id) =>
    set((s) => ({
      plugins: s.plugins.map((p) => (p.id === id ? { ...p, enabled: !p.enabled } : p)),
    })),

  gitBranch: "main",
  setGitBranch: (branch) => set({ gitBranch: branch }),

  searchOpen: false,
  toggleSearch: () => set((s) => ({ searchOpen: !s.searchOpen })),

  suggestions: [],
  setSuggestions: (suggestions) => set({ suggestions }),

  previewFile: null,
  setPreviewFile: (previewFile) => set({ previewFile }),

  splitMode: "none",
  setSplitMode: (splitMode) => set({ splitMode }),

  achievements: [
    { id: "first-cmd", name: "First Steps", description: "Execute your first command", icon: "terminal", unlocked: false },
    { id: "10-cmds", name: "Getting Started", description: "Execute 10 commands", icon: "zap", unlocked: false },
    { id: "50-cmds", name: "Power User", description: "Execute 50 commands", icon: "flame", unlocked: false },
    { id: "100-cmds", name: "Terminal Master", description: "Execute 100 commands", icon: "crown", unlocked: false },
    { id: "theme-switcher", name: "Fashionista", description: "Try all 4 themes", icon: "palette", unlocked: false },
    { id: "snippet-creator", name: "Macro Wizard", description: "Create a custom snippet", icon: "code", unlocked: false },
    { id: "multi-tab", name: "Multitasker", description: "Open 3+ tabs simultaneously", icon: "layers", unlocked: false },
    { id: "focus-master", name: "Deep Focus", description: "Use focus mode", icon: "eye", unlocked: false },
    { id: "hour-session", name: "Marathon", description: "Session longer than 1 hour", icon: "clock", unlocked: false },
    { id: "split-screen", name: "Divide & Conquer", description: "Use split panes", icon: "columns", unlocked: false },
  ],
  checkAchievements: () => {
    const state = get();
    const updated = state.achievements.map((a) => {
      if (a.unlocked) return a;
      let shouldUnlock = false;
      switch (a.id) {
        case "first-cmd": shouldUnlock = state.commandCount >= 1; break;
        case "10-cmds": shouldUnlock = state.commandCount >= 10; break;
        case "50-cmds": shouldUnlock = state.commandCount >= 50; break;
        case "100-cmds": shouldUnlock = state.commandCount >= 100; break;
        case "multi-tab": shouldUnlock = state.tabs.length >= 3; break;
        case "focus-master": shouldUnlock = state.focusMode; break;
        case "split-screen": shouldUnlock = state.splitMode !== "none"; break;
        case "hour-session": shouldUnlock = (Date.now() - state.sessionStartTime) >= 3600000; break;
        default: break;
      }
      if (shouldUnlock) return { ...a, unlocked: true, unlockedAt: Date.now() };
      return a;
    });
    if (JSON.stringify(updated) !== JSON.stringify(state.achievements)) {
      set({ achievements: updated });
    }
  },
}));
