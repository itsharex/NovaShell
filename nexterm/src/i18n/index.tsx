import { createContext, useContext, useCallback, type ReactNode } from "react";
import { useAppStore } from "../store/appStore";
import { en } from "./en";
import { es } from "./es";

export type Lang = "en" | "es";

const dictionaries: Record<Lang, Record<string, any>> = { en, es };

// Flatten nested keys: { a: { b: "x" } } → { "a.b": "x" }
function flatten(obj: Record<string, any>, prefix = ""): Record<string, string> {
  const result: Record<string, string> = {};
  for (const key in obj) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof obj[key] === "object" && obj[key] !== null) {
      Object.assign(result, flatten(obj[key], fullKey));
    } else {
      result[fullKey] = String(obj[key]);
    }
  }
  return result;
}

// Lazy-flatten: only process each language when first accessed
const flatDictsCache: Partial<Record<Lang, Record<string, string>>> = {};
function getFlatDict(lang: Lang): Record<string, string> {
  if (!flatDictsCache[lang]) {
    flatDictsCache[lang] = flatten(dictionaries[lang]);
  }
  return flatDictsCache[lang]!;
}

type TFunction = (key: string, params?: Record<string, string | number>) => string;

const I18nContext = createContext<TFunction>((key) => key);

export function I18nProvider({ children }: { children: ReactNode }) {
  const lang = useAppStore((s) => s.language);

  const t: TFunction = useCallback(
    (key: string, params?: Record<string, string | number>) => {
      let text = getFlatDict(lang)[key] ?? getFlatDict("en")[key] ?? key;
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          text = text.replace(`{${k}}`, String(v));
        }
      }
      return text;
    },
    [lang],
  );

  return <I18nContext.Provider value={t}>{children}</I18nContext.Provider>;
}

export function useT(): TFunction {
  return useContext(I18nContext);
}

export { en, es };
