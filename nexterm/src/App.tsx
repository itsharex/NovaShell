import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { TitleBar } from "./components/TitleBar";
import { TabBar } from "./components/TabBar";
import { TerminalPanel } from "./components/TerminalPanel";
import { Sidebar } from "./components/Sidebar";
import { StatusBar } from "./components/StatusBar";
import { AchievementToast } from "./components/AchievementToast";
import { useAppStore } from "./store/appStore";

function App() {
  const { theme, sidebarOpen, focusMode } = useAppStore();

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  return (
    <div className={`app-container theme-${theme} ${focusMode ? "focus-mode" : ""}`}>
      <TitleBar />
      <div className="app-body">
        <div className="main-area">
          <TabBar />
          <TerminalPanel />
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
      <StatusBar />
      <AchievementToast />
    </div>
  );
}

export default App;
