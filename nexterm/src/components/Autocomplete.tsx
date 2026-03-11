interface AutocompleteProps {
  suggestions: string[];
  onSelect: (cmd: string) => void;
  visible: boolean;
  selectedIndex: number;
}

export function Autocomplete({ suggestions, onSelect, visible, selectedIndex }: AutocompleteProps) {
  if (!visible || suggestions.length === 0) return null;

  return (
    <div className="autocomplete-dropdown">
      {suggestions.map((suggestion, i) => (
        <div
          key={suggestion}
          className={`autocomplete-item ${i === selectedIndex ? "active" : ""}`}
          onClick={() => onSelect(suggestion)}
        >
          <span style={{ color: "var(--accent-primary)", marginRight: 8, fontSize: 10 }}>{">"}</span>
          {suggestion}
        </div>
      ))}
    </div>
  );
}
