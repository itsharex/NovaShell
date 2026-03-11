import { useEffect, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { TitleBar } from "./components/TitleBar";
import { TabBar } from "./components/TabBar";
import { TerminalPanel } from "./components/TerminalPanel";
import { Sidebar } from "./components/Sidebar";
import { StatusBar } from "./components/StatusBar";
import { AchievementToast } from "./components/AchievementToast";
import { UpdateNotification } from "./components/UpdateNotification";
import { useAppStore } from "./store/appStore";

const MemoizedTerminalPanel = memo(TerminalPanel);
const MemoizedTabBar = memo(TabBar);
const MemoizedStatusBar = memo(StatusBar);

function App() {
  const theme = useAppStore((s) => s.theme);
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const focusMode = useAppStore((s) => s.focusMode);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  return (
    <div className={`app-container theme-${theme} ${focusMode ? "focus-mode" : ""}`}>
      <TitleBar />
      <div className="app-body">
        <div className="main-area">
          <MemoizedTabBar />
          <MemoizedTerminalPanel />
        </div>
        <AnimatePresence>
          {sidebarOpen && (
            <motion.div
              className="sidebar-wrapper"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 320, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
            >
              <Sidebar />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <MemoizedStatusBar />
      <AchievementToast />
      <UpdateNotification />
    </div>
  );
}

export default App;
