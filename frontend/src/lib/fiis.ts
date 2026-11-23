import type { BaseRecord } from "./types";

export interface FiiHolding extends BaseRecord {
  ticker: string;
  name?: string;
  broker?: string;
  quantity: number;
  average_price: number;
  current_price: number;
  quoted_at?: string;
  notes?: string;
}

export interface FiiDividend extends BaseRecord {
  fii: string;
  payment_date: string;
  amount: number;
  notes?: string;
}

export const holdingCost = (fii: FiiHolding) => fii.quantity * fii.average_price;
/** Market value; without a quote, the cost (quantity × average price). */
export const holdingValue = (fii: FiiHolding) =>
  fii.quantity * (fii.current_price > 0 ? fii.current_price : fii.average_price);
export const holdingChange = (fii: FiiHolding) => holdingValue(fii) - holdingCost(fii);
export const holdingChangePct = (fii: FiiHolding) =>
  holdingCost(fii) > 0 ? (holdingChange(fii) / holdingCost(fii)) * 100 : 0;

export type FiiSort = "date" | "name";

/** "date": order of registration (`created`), oldest first, missing last; "name": ticker A-Z. */
export function sortFiis(list: FiiHolding[], sort: FiiSort = "date"): FiiHolding[] {
  const ticker = (a: FiiHolding, b: FiiHolding) =>
    a.ticker.localeCompare(b.ticker, "pt-BR", { sensitivity: "base" });
  // Missing `created` sorts last, like positions() in lib/invest.ts.
  const created = (a: FiiHolding, b: FiiHolding) => {
    const x = a.created ?? "";
    const y = b.created ?? "";
    if (x === y) return 0;
    if (!x) return 1;
    if (!y) return -1;
    return x < y ? -1 : 1;
  };
  return [...list].sort((a, b) =>
    sort === "name" ? ticker(a, b) || created(a, b) : created(a, b) || ticker(a, b),
  );
}

export function fiiTotals(holdings: FiiHolding[], dividends: FiiDividend[]) {
  const cost = holdings.reduce((sum, fii) => sum + holdingCost(fii), 0);
  const value = holdings.reduce((sum, fii) => sum + holdingValue(fii), 0);
  return {
    cost,
    value,
    change: value - cost,
    changePct: cost > 0 ? ((value - cost) / cost) * 100 : 0,
    dividends: dividends.reduce((sum, dividend) => sum + dividend.amount, 0),
  };
}
