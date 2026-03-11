import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Terminal,
  Zap,
  Flame,
  Crown,
  Palette,
  Code2,
  Layers,
  Eye,
  Clock,
  Columns,
  Trophy,
} from "lucide-react";
import { useAppStore } from "../store/appStore";
import type { Achievement } from "../store/appStore";

const iconMap: Record<string, typeof Terminal> = {
  terminal: Terminal,
  zap: Zap,
  flame: Flame,
  crown: Crown,
  palette: Palette,
  code: Code2,
  layers: Layers,
  eye: Eye,
  clock: Clock,
  columns: Columns,
};

export function AchievementToast() {
  const achievements = useAppStore((s) => s.achievements);
  const [toast, setToast] = useState<Achievement | null>(null);
  const [shown, setShown] = useState<Set<string>>(new Set());

  useEffect(() => {
    const newlyUnlocked = achievements.find(
      (a) => a.unlocked && a.unlockedAt && !shown.has(a.id) && Date.now() - a.unlockedAt < 3000
    );
    if (newlyUnlocked) {
      setToast(newlyUnlocked);
      setShown((prev) => new Set(prev).add(newlyUnlocked.id));
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [achievements, shown]);

  const Icon = toast ? iconMap[toast.icon] || Trophy : Trophy;

  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          className="achievement-toast"
          initial={{ opacity: 0, y: 60, scale: 0.8 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.9 }}
          transition={{ type: "spring", damping: 20, stiffness: 300 }}
        >
          <div className="achievement-toast-icon">
            <Icon size={20} />
          </div>
          <div className="achievement-toast-content">
            <div className="achievement-toast-label">Achievement Unlocked!</div>
            <div className="achievement-toast-name">{toast.name}</div>
            <div className="achievement-toast-desc">{toast.description}</div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
