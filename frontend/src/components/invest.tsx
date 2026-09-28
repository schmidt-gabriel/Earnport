import { useEffect, useState } from "react";
import { brl } from "../lib/pb";
import { useCollection } from "../lib/useCollection";
import {
  DEFAULT_CDI,
  kindLabel,
  liquidityLabel,
  rateLabel,
  indexerOf,
  type Position,
} from "../lib/invest";
import { fmtDate, pct } from "../lib/pb";
import { Button, Card } from "./ui";

// Shared pieces of the Pessoa Física module: reference rates persisted in
// `settings_invest` and the card each position is rendered as.

type InvestSettings = {
  id: string;
  cdi_rate?: number;
  ipca_rate?: number;
  ipca_rate_set?: boolean;
};

/**
 * CDI and optional IPCA estimate, saved in `settings_invest` when the
 * investment modal is submitted.
 */
export function useRates() {
  const { list, create, update } = useCollection<InvestSettings>("settings_invest", {
    // singleton: no `created` field, so the default -created sort would 400.
    sort: "-updated",
  });
  const record = list.data?.[0];
  const [rates, setRates] = useState<{ cdi: number; ipca: number | null } | null>(null);

  // Adopt the stored value once, when it arrives.
  useEffect(() => {
    if (rates !== null || !list.isSuccess) return;
    setRates({
      cdi: record?.cdi_rate ?? DEFAULT_CDI,
      ipca: record?.ipca_rate_set ? (record.ipca_rate ?? 0) : null,
    });
  }, [list.isSuccess, record, rates]);

  async function saveReference(indexer: "cdi" | "ipca", value: number | null) {
    const current = record ?? (await list.refetch()).data?.[0];
    const previous = rates ?? {
      cdi: current?.cdi_rate ?? DEFAULT_CDI,
      ipca: current?.ipca_rate_set ? (current.ipca_rate ?? 0) : null,
    };
    const next = indexer === "cdi"
      ? { ...previous, cdi: value as number }
      : { ...previous, ipca: value };
    if (next.cdi === previous.cdi && next.ipca === previous.ipca) return;
    const data = {
      cdi_rate: next.cdi,
      ipca_rate: next.ipca ?? 0,
      ipca_rate_set: next.ipca !== null,
    };
    if (current) await update.mutateAsync({ id: current.id, data });
    else await create.mutateAsync(data);
    setRates(next);
  }

  return {
    cdi: rates?.cdi ?? DEFAULT_CDI,
    ipca: rates?.ipca ?? null,
    ready: rates !== null,
    error: list.isError,
    saveReference,
  };
}

function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "win" | "warn";
}) {
  const styles = {
    neutral:
      "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400",
    win: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400",
    warn: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-400",
  }[tone];
  return (
    <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${styles}`}>
      {children}
    </span>
  );
}

/**
 * A real position with an estimated current value after the applicable IR.
 * A maturity-only investment is not available for redemption today.
 */
export function PositionCard({
  position: p,
  actions,
}: {
  position: Position;
  actions?: React.ReactNode;
}) {
  const inv = p.investment;
  return (
    <Card className="flex flex-col p-4">
      <div>
        <h3 className="font-semibold leading-tight">{inv.name}</h3>
        <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
          {inv.broker ? `${inv.broker} · ` : ""}
          {kindLabel(inv.kind)}
        </p>
      </div>

      <div className="mt-4 space-y-1">
        <p className="text-2xl font-semibold tabular-nums">
          {p.today ? brl(p.today.net) : "Sem estimativa"}
        </p>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          {inv.liquidity === "maturity" ? "Valor estimado hoje" : "Valor líquido estimado hoje"}
        </p>
        <p className="text-xs tabular-nums text-neutral-500 dark:text-neutral-400">
          {brl(p.amount)} aplicados
          {inv.applied_at && ` em ${fmtDate(inv.applied_at)}`}
        </p>
        {/* A taxa contratada, como ela foi digitada no formulário. */}
        <p className="text-xs tabular-nums text-neutral-500 dark:text-neutral-400">
          {rateLabel(inv)}
          {p.today && p.today.taxRate > 0 && ` · IR ${pct(p.today.taxRate * 100)}%`}
        </p>
        {p.atMaturity && !p.matured && (
          <p className="text-xs tabular-nums text-neutral-500 dark:text-neutral-400">
            No vencimento: {brl(p.atMaturity.net)}
          </p>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-1.5">
        <Badge>{liquidityLabel(inv.liquidity)}</Badge>
        {indexerOf(inv) === "ipca" && !p.today && <Badge tone="warn">Informe IPCA estimado</Badge>}
        {inv.maturity && (
          <Badge>
            Vence {fmtDate(inv.maturity)}
            {inv.liquidity === "maturity" && !p.matured && p.daysUntilMaturity !== null && (
              p.daysUntilMaturity === 0
                ? " · hoje"
                : ` · faltam ${p.daysUntilMaturity} ${p.daysUntilMaturity === 1 ? "dia" : "dias"}`
            )}
          </Badge>
        )}
        {p.matured && <Badge tone="warn">Vencido</Badge>}
        {p.pending && (
          <Badge tone="warn">
            {inv.applied_at ? "Aplicação futura" : "Sem data de aplicação"}
          </Badge>
        )}
      </div>

      {actions && (
        <div className="mt-4 flex justify-end gap-1 border-t border-neutral-100 pt-3 dark:border-neutral-800">
          {actions}
        </div>
      )}
    </Card>
  );
}

/** Empty state of the Investimentos page. */
export function NoInvestments({ onAdd }: { onAdd?: () => void }) {
  return (
    <Card className="p-10 text-center">
      <p className="text-sm text-neutral-500 dark:text-neutral-400">
        Nenhum investimento cadastrado.
      </p>
      {onAdd && (
        <Button className="mt-4" onClick={onAdd}>
          + Adicionar
        </Button>
      )}
    </Card>
  );
}
