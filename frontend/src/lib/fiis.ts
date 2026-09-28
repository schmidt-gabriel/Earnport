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
export const holdingValue = (fii: FiiHolding) => fii.quantity * fii.current_price;
export const holdingChange = (fii: FiiHolding) => holdingValue(fii) - holdingCost(fii);
export const holdingChangePct = (fii: FiiHolding) =>
  holdingCost(fii) > 0 ? (holdingChange(fii) / holdingCost(fii)) * 100 : 0;

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
