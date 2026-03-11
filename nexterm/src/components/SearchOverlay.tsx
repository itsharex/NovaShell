import { useState, useEffect, useRef } from "react";
import { Search, ChevronUp, ChevronDown, X } from "lucide-react";

interface SearchOverlayProps {
  onSearch: (query: string, direction: "next" | "prev") => void;
  onClose: () => void;
}

export function SearchOverlay({ onSearch, onClose }: SearchOverlayProps) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "Enter") {
        if (e.shiftKey) {
          onSearch(query, "prev");
        } else {
          onSearch(query, "next");
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [query, onSearch, onClose]);

  return (
    <div className="search-overlay">
      <Search size={14} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
      <input
        ref={inputRef}
        type="text"
        className="search-input"
        placeholder="Search in terminal..."
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          if (e.target.value) onSearch(e.target.value, "next");
        }}
      />
      <button
        onClick={() => onSearch(query, "prev")}
        style={{
          background: "none",
          border: "none",
          color: "var(--text-secondary)",
          cursor: "pointer",
          padding: 2,
          display: "flex",
        }}
        title="Previous (Shift+Enter)"
        aria-label="Previous match"
      >
        <ChevronUp size={14} />
      </button>
      <button
        onClick={() => onSearch(query, "next")}
        style={{
          background: "none",
          border: "none",
          color: "var(--text-secondary)",
          cursor: "pointer",
          padding: 2,
          display: "flex",
        }}
        title="Next (Enter)"
        aria-label="Next match"
      >
        <ChevronDown size={14} />
      </button>
      <button
        onClick={onClose}
        style={{
          background: "none",
          border: "none",
          color: "var(--text-muted)",
          cursor: "pointer",
          padding: 2,
          display: "flex",
        }}
        title="Close (Esc)"
        aria-label="Close search"
      >
        <X size={14} />
      </button>
    </div>
  );
}
