import { useState } from "react";

export type SortPref = "date" | "name";

const key = (page: string) => `sort:${page}`;

/** The sort a page last used, from localStorage; "date" when unset or unreadable. */
export function readSortPref(page: string): SortPref {
  try {
    const saved = localStorage.getItem(key(page));
    if (saved === "date" || saved === "name") return saved;
  } catch {
    // Storage blocked: use the default.
  }
  return "date";
}

/** Per-page sort choice, remembered across reloads. */
export function useSortPref(page: string) {
  const [sort, setSort] = useState<SortPref>(() => readSortPref(page));
  const update = (next: SortPref) => {
    setSort(next);
    try {
      localStorage.setItem(key(page), next);
    } catch {
      // Not persisted; still applies until the page unmounts.
    }
  };
  return [sort, update] as const;
}
