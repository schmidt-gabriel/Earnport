// One app-wide choice of separators for every number shown or typed:
// "comma" = "1.099,55" (pt-BR, default) and "dot" = "1,099.55" (en-US).
// Display/input only: values stored, exported or sent to the backend stay
// plain JS numbers.
export type NumberFormat = "comma" | "dot";

const KEY = "number_format";
const LOCALE: Record<NumberFormat, string> = { comma: "pt-BR", dot: "en-US" };

function load(): NumberFormat {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "comma" || saved === "dot") return saved;
  } catch {
    // Storage blocked: fall back to the default.
  }
  return "comma";
}

let current: NumberFormat = load();
const listeners = new Set<() => void>();

export const getNumberFormat = () => current;

export function setNumberFormat(next: NumberFormat) {
  if (next === current) return;
  current = next;
  try {
    localStorage.setItem(KEY, next);
  } catch {
    // Not persisted; still applies to this session.
  }
  listeners.forEach((l) => l());
}

export function subscribeNumberFormat(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// The one number formatter: fixed or ranged fraction digits, grouped
// thousands, separators from the preference. num(1099.5, 2) -> "1.099,50".
export function num(v: number, minDigits = 0, maxDigits = minDigits): string {
  return v.toLocaleString(LOCALE[current], {
    minimumFractionDigits: minDigits,
    maximumFractionDigits: Math.max(minDigits, maxDigits),
  });
}

// Currency = fixed symbol per currency + the number in the chosen separators.
// The symbol never follows the preference ("R$ 1,099.55" is valid in "dot").
// The space is non-breaking (U+00A0), as Intl's currency style uses.
export function currency(v: number, symbol: string, space: boolean): string {
  const sign = v < 0 ? "-" : "";
  return `${sign}${symbol}${space ? "\u00a0" : ""}${num(Math.abs(v), 2)}`;
}
