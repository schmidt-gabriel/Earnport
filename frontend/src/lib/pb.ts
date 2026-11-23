import PocketBase from "pocketbase";
import { currency, num } from "./numberFormat";

// "/" → root-relative to the current origin. Using "" would make the SDK
// resolve API paths relative to the current route (e.g. "/lucros/api/..."),
// which breaks on nested routes. In dev, Vite proxies /api and /_ to the
// backend; in production PocketBase serves the SPA, so same origin works too.
export const pb = new PocketBase("/");

// Display formatters. Separators follow the app-wide number format preference
// (lib/numberFormat.ts); symbols stay per currency. Never use them for values
// sent to the backend or written to exports.
export { num } from "./numberFormat";

export const brl = (v: number) => currency(v, "R$", true);

export const usd = (v: number) => currency(v, "$", false);

// Percentual com uma casa: 88.3 -> "88,3" (or "88.3" in the "dot" format).
export const pct = (v: number) => num(v, 1);

// FX quotes and effective rates: four decimals ("5,4321").
export const quote = (v: number) => num(v, 4);

// PocketBase stores datetimes; we work with calendar dates in the UI.
// "2026-06-26 12:00:00.000Z" -> "2026-06-26" for <input type="date">.
export const toDateInput = (pbDate?: string) => (pbDate ? pbDate.slice(0, 10) : "");

// "2026-06-26" -> ISO string PocketBase accepts (noon UTC avoids TZ drift).
export const fromDateInput = (value: string) =>
  value ? `${value} 12:00:00.000Z` : "";

// "2026-06-26 ..." -> "26/06/2026" for display.
export const fmtDate = (pbDate?: string) => {
  if (!pbDate) return "";
  const [y, m, d] = pbDate.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
};
