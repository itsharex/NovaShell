import { useState, useRef, useEffect } from "react";
import { Plus, X, ChevronDown, Terminal as TermIcon } from "lucide-react";
import { useAppStore } from "../store/appStore";

const shellIcons: Record<string, string> = {
  powershell: "PS",
  cmd: ">_",
  bash: "$",
  zsh: "%",
};

export function TabBar() {
  const { tabs, activeTabId, addTab, closeTab, setActiveTab } = useAppStore();
  const [showShellMenu, setShowShellMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowShellMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const shells = [
    { id: "powershell", name: "PowerShell", icon: "PS" },
    { id: "cmd", name: "CMD", icon: ">_" },
    { id: "bash", name: "Git Bash", icon: "$" },
    { id: "wsl", name: "WSL", icon: "~" },
  ];

  return (
    <div className="tab-bar">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className={`tab ${tab.id === activeTabId ? "active" : ""}`}
          onClick={() => setActiveTab(tab.id)}
        >
          <span className="tab-icon" style={{ fontSize: 10, fontWeight: 700 }}>
            {shellIcons[tab.shellType] || ">_"}
          </span>
          <span>{tab.title}</span>
          {tabs.length > 1 && (
            <span
              className="tab-close"
              onClick={(e) => {
                e.stopPropagation();
                closeTab(tab.id);
              }}
            >
              <X size={10} />
            </span>
          )}
        </button>
      ))}
      <div className="shell-selector" ref={menuRef}>
        <button
          className="tab-add"
          onClick={() => setShowShellMenu(!showShellMenu)}
          title="New Tab"
        >
          <Plus size={14} />
        </button>
        {showShellMenu && (
          <div className="shell-dropdown animate-slide-up">
            {shells.map((shell) => (
              <button
                key={shell.id}
                className="shell-option"
                onClick={() => {
                  addTab(shell.id);
                  setShowShellMenu(false);
                }}
              >
                <span style={{ fontWeight: 700, width: 24 }}>{shell.icon}</span>
                {shell.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}