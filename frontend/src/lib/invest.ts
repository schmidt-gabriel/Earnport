// Calculadora de renda fixa (módulo Pessoa Física).
//
// Pure functions, no React, no I/O: a carteira é uma função dos índices e da
// lista de investimentos.
//
// Convention followed everywhere here: percentages arrive the way the user
// types them (13.9 = 13,9% a.a., 98 = 98% do CDI) and are turned into
// fractions at the edge, by `fromPct`.

import type { BaseRecord } from "./types";

export type InvestKind = "cdb" | "lci_lca" | "tesouro";
/** `selic` only pairs with kind `tesouro`; `cdi` never does (the form enforces it). */
export type Indexer = "cdi" | "ipca" | "fixed" | "selic";
export type Liquidity = "daily" | "maturity" | "market";

export interface Investment extends BaseRecord {
  name: string;
  kind: InvestKind;
  /** Empty on an older backup means CDI. */
  indexer?: Indexer;
  /** CDI: % do CDI; IPCA and Selic: spread a.a.; fixed: taxa a.a. */
  rate_pct?: number;
  /** Legacy CDI rate kept for older backups. */
  cdi_pct?: number;
  liquidity?: Liquidity;
  /** PocketBase datetime; empty means no maturity (e.g. pure daily liquidity). */
  maturity?: string;
  /** Valor aplicado de verdade, R$ (a aba Investimentos são posições reais). */
  amount?: number;
  /** Data da aplicação, PocketBase datetime. */
  applied_at?: string;
  /** Corretora onde o título está ("XP"), texto livre. */
  broker?: string;
  notes?: string;
}

/** CDI usado enquanto o singleton `settings_invest` não tem um valor. */
export const DEFAULT_CDI = 13.9;

export const kindLabel = (k: InvestKind) =>
  k === "cdb" ? "CDB" : k === "tesouro" ? "Tesouro" : "LCI/LCA";
/** Indexers the form offers for each kind. The first one is the default. */
export const indexersFor = (k: InvestKind): Indexer[] =>
  k === "tesouro" ? ["selic", "ipca", "fixed"] : ["cdi", "ipca", "fixed"];
/** LCI/LCA are exempt; CDB and Tesouro Direto pay the regressive IR. */
export const isTaxed = (k: InvestKind) => k !== "lci_lca";
export const indexerOf = (inv: Investment): Indexer => inv.indexer || "cdi";
export const contractedRateOf = (inv: Investment) =>
  inv.indexer ? (inv.rate_pct ?? 0) : (inv.cdi_pct ?? inv.rate_pct ?? 0);
export const rateLabel = (inv: Investment) => {
  const indexer = indexerOf(inv);
  const rate = contractedRateOf(inv).toLocaleString("pt-BR", {
    minimumFractionDigits: indexer === "fixed" ? 2 : 0,
    maximumFractionDigits: indexer === "selic" ? 4 : 2,
  });
  switch (indexer) {
    case "ipca": return `IPCA + ${rate}% a.a.`;
    case "selic": return `Selic + ${rate}% a.a.`;
    case "fixed": return `${rate}% a.a. prefixado`;
    default: return `${rate}% do CDI`;
  }
};
export const liquidityLabel = (l?: Liquidity) =>
  l === "maturity" ? "No vencimento" : l === "market" ? "Mercado" : "Diária";

const fromPct = (v: number) => v / 100;

// ---------------------------------------------------------------------------
// Prazo
// ---------------------------------------------------------------------------

/** Dias úteis por ano usados na capitalização do CDI (padrão B3). */
export const BUSINESS_DAYS_PER_YEAR = 252;
const CALENDAR_DAYS_PER_YEAR = 365;

// ---------------------------------------------------------------------------
// IR regressivo (renda fixa), por dias corridos da aplicação
// ---------------------------------------------------------------------------

export const IR_BRACKETS: { upTo: number; rate: number }[] = [
  { upTo: 180, rate: 0.225 },
  { upTo: 360, rate: 0.2 },
  { upTo: 720, rate: 0.175 },
  { upTo: Infinity, rate: 0.15 },
];

export const irRate = (calendarDays: number) =>
  IR_BRACKETS.find((b) => calendarDays <= b.upTo)!.rate;

// ---------------------------------------------------------------------------
// Taxa de custódia B3 (Tesouro Direto)
// ---------------------------------------------------------------------------

/** Taxa de custódia da B3 sobre títulos do Tesouro Direto: 0,20% a.a. */
export const TESOURO_CUSTODY_RATE = 0.002;
/** Parcela do Tesouro Selic isenta da custódia, R$. */
export const TESOURO_SELIC_CUSTODY_EXEMPT = 10_000;

/**
 * Custódia acumulada de um título do Tesouro, cobrada pro rata por dias
 * corridos (dias/365) sobre o valor da posição.
 *
 * Approximation, kept simple on purpose: the B3 charges on the daily position
 * value, while here the base is the average of the principal and the gross
 * value at the date (a straight line between the two). The Tesouro Selic
 * exemption (first R$10.000) is applied per position, whereas the B3 applies
 * it to the investor's whole Tesouro Selic balance.
 */
export function tesouroCustody(
  amount: number,
  grossGain: number,
  indexer: Indexer,
  calendarDays: number,
): number {
  const average = amount + grossGain / 2;
  const base = indexer === "selic"
    ? Math.max(0, average - TESOURO_SELIC_CUSTODY_EXEMPT)
    : average;
  return base * TESOURO_CUSTODY_RATE * (calendarDays / CALENDAR_DAYS_PER_YEAR);
}

// ---------------------------------------------------------------------------
// Rendimento
// ---------------------------------------------------------------------------

/** Taxa diária equivalente ao CDI anual: (1 + cdi)^(1/252) - 1. */
export const dailyCdi = (cdiAnnualPct: number) =>
  Math.pow(1 + fromPct(cdiAnnualPct), 1 / BUSINESS_DAYS_PER_YEAR) - 1;

/**
 * Fator de rendimento composto em dias úteis:
 * (1 + taxa_diária_CDI x %CDI)^dias_úteis
 */
export const growthFactor = (cdiAnnualPct: number, cdiPct: number, businessDays: number) =>
  Math.pow(1 + dailyCdi(cdiAnnualPct) * fromPct(cdiPct), businessDays);

/** Equivalent daily rate for a contracted annual rate. */
export const annualGrowthFactor = (annualPct: number, businessDays: number) =>
  Math.pow(1 + fromPct(annualPct), businessDays / BUSINESS_DAYS_PER_YEAR);

/** Dias úteis equivalentes a um número de dias corridos. */
export const businessDaysIn = (calendarDays: number) =>
  Math.max(
    0,
    Math.round((calendarDays * BUSINESS_DAYS_PER_YEAR) / CALENDAR_DAYS_PER_YEAR),
  );

/** Rendimento de um valor por um período. É o núcleo de tudo nesta tela. */
export interface Yield {
  businessDays: number;
  grossGain: number;
  /** Custódia B3 acumulada (só Tesouro; 0 nos demais). Reduz a base do IR. */
  custody: number;
  /** Alíquota de IR aplicada (0 para LCI/LCA). */
  taxRate: number;
  tax: number;
  /** Valor final líquido (aplicado + ganho líquido, já sem custódia e IR). */
  net: number;
  netGain: number;
  /** Quanto o líquido equivale em % do CDI (100% do CDI bruto = 100). */
  netCdiPct: number;
}

export function yieldOf(
  amount: number,
  cdiAnnualPct: number,
  cdiPct: number,
  kind: InvestKind,
  calendarDays: number,
): Yield {
  const businessDays = businessDaysIn(calendarDays);
  const grossGain = amount * (growthFactor(cdiAnnualPct, cdiPct, businessDays) - 1);
  return settle(amount, grossGain, kind, "cdi", cdiAnnualPct, calendarDays);
}

/**
 * Gross gain to net: custódia (Tesouro only), then IR on the gross gain minus
 * the custódia. LCI/LCA são isentas; CDB e Tesouro pagam IR na faixa do prazo.
 */
function settle(
  amount: number,
  grossGain: number,
  kind: InvestKind,
  indexer: Indexer,
  cdiAnnualPct: number,
  calendarDays: number,
): Yield {
  const businessDays = businessDaysIn(calendarDays);
  const custody = kind === "tesouro"
    ? tesouroCustody(amount, grossGain, indexer, calendarDays)
    : 0;
  const taxRate = isTaxed(kind) ? irRate(calendarDays) : 0;
  const tax = Math.max(0, grossGain - custody) * taxRate;
  const netGain = grossGain - custody - tax;
  const cdi100Gain = amount * (growthFactor(cdiAnnualPct, 100, businessDays) - 1);
  return {
    businessDays,
    grossGain,
    custody,
    taxRate,
    tax,
    net: amount + netGain,
    netGain,
    netCdiPct: cdi100Gain > 0 ? (netGain / cdi100Gain) * 100 : 0,
  };
}

/**
 * Reference rates the carteira is estimated with, as typed (% a.a.). IPCA and
 * Selic are optional estimates: null leaves positions indexed to them pending.
 */
export interface Rates {
  cdi: number;
  ipca: number | null;
  selic: number | null;
}

/**
 * Estimate for any indexer. Prefixado, IPCA + spread and Selic + spread use a
 * constant annual rate; IPCA and Selic need their estimate, or return null.
 */
export function yieldFor(
  amount: number,
  inv: Investment,
  rates: Rates,
  calendarDays: number,
): Yield | null {
  const indexer = indexerOf(inv);
  const rate = contractedRateOf(inv);
  if (indexer === "cdi") return yieldOf(amount, rates.cdi, rate, inv.kind, calendarDays);
  const reference = indexer === "ipca" ? rates.ipca : indexer === "selic" ? rates.selic : 0;
  if (reference === null) return null;

  const businessDays = businessDaysIn(calendarDays);
  // (1 + índice estimado) x (1 + spread) - 1; prefixado is just the rate.
  const annualPct = indexer === "fixed"
    ? rate
    : ((1 + fromPct(reference)) * (1 + fromPct(rate)) - 1) * 100;
  const grossGain = amount * (annualGrowthFactor(annualPct, businessDays) - 1);
  return settle(amount, grossGain, inv.kind, indexer, rates.cdi, calendarDays);
}

// ---------------------------------------------------------------------------
// Posições reais (aba Investimentos)
// ---------------------------------------------------------------------------

const parseDate = (pb?: string) =>
  pb ? new Date(`${pb.slice(0, 10)}T12:00:00`) : null;

export const maturityOf = (inv: Investment) => parseDate(inv.maturity);

const daysBetween = (from: Date, to: Date) =>
  Math.max(0, Math.round((to.getTime() - from.getTime()) / 86_400_000));

/** O que um título comprado de verdade vale hoje, e o que valerá no vencimento. */
export interface Position {
  investment: Investment;
  /** Valor aplicado. Zero quando o registro ainda não tem o campo preenchido. */
  amount: number;
  /** Dias corridos rendendo. Para no vencimento se o título já venceu. */
  days: number;
  /** Valor estimado hoje, com IR da faixa dos `days` quando aplicável. */
  today: Yield | null;
  /** Projeção líquida no vencimento; null se o título não tem vencimento. */
  atMaturity: (Yield & { days: number }) | null;
  /** Calendar days until maturity, with zero on the maturity date. */
  daysUntilMaturity: number | null;
  matured: boolean;
  /** Aplicação futura (data ainda por vir) ou sem data: nada rendeu ainda. */
  pending: boolean;
}

export function positionOf(
  inv: Investment,
  rates: Rates,
  now: Date = new Date(),
): Position {
  const amount = inv.amount ?? 0;
  // Match parseDate's local noon so an application dated today is not future.
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  const applied = parseDate(inv.applied_at);
  const maturity = maturityOf(inv);

  // Um título vencido para de render: a contagem trava no vencimento.
  const until = maturity && maturity < today ? maturity : today;
  const days = applied ? daysBetween(applied, until) : 0;
  const maturityDays = applied && maturity ? daysBetween(applied, maturity) : 0;
  const maturityYield = applied && maturity
    ? yieldFor(amount, inv, rates, maturityDays)
    : null;

  return {
    investment: inv,
    amount,
    days,
    today: yieldFor(amount, inv, rates, days),
    atMaturity: maturityYield ? { days: maturityDays, ...maturityYield } : null,
    daysUntilMaturity: maturity ? daysBetween(today, maturity) : null,
    matured: !!maturity && maturity < today,
    pending: !applied || applied > today,
  };
}

/**
 * A carteira toda, do melhor para o pior. O critério é o **% líquido do CDI**,
 * não o ganho em reais: as posições têm tamanhos diferentes, então reais
 * premiariam a maior aplicação em vez do melhor papel.
 */
export function positions(
  list: Investment[],
  rates: Rates,
  now?: Date,
): Position[] {
  return list
    .map((inv) => positionOf(inv, rates, now))
    .sort((a, b) => {
      // Pending positions (no estimate) always go last; custody can push a
      // real netCdiPct below any small negative sentinel.
      const x = a.today?.netCdiPct ?? -Infinity;
      const y = b.today?.netCdiPct ?? -Infinity;
      return x === y ? 0 : y > x ? 1 : -1;
    });
}

/** Somatório da carteira: aplicado, valor hoje e ganho líquido. */
export function portfolioTotals(list: Position[]) {
  return list.reduce(
    (acc, p) => ({
      amount: acc.amount + p.amount,
      net: acc.net + (p.today?.net ?? 0),
      netGain: acc.netGain + (p.today?.netGain ?? 0),
      incomplete: acc.incomplete || p.today === null,
    }),
    { amount: 0, net: 0, netGain: 0, incomplete: false },
  );
}
