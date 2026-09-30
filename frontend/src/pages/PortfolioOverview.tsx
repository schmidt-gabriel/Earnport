import { useState } from "react";
import { Link } from "react-router-dom";
import { Button, Card, Field, Input, Modal } from "../components/ui";
import { useRates } from "../components/invest";
import { fiiTotals, holdingChange, type FiiDividend, type FiiHolding } from "../lib/fiis";
import { portfolioTotals, positions, type Investment } from "../lib/invest";
import { brl, fmtDate } from "../lib/pb";
import { useCollection } from "../lib/useCollection";

type InvestSettings = { id: string; cash_balance?: number };

export default function PortfolioOverview() {
  const settings = useCollection<InvestSettings>("settings_invest", { sort: "-updated" });
  const [cashOpen, setCashOpen] = useState(false);
  const [cashInput, setCashInput] = useState("");
  const [cashError, setCashError] = useState("");
  const investments = useCollection<Investment>("investments_invest", { sort: "name" });
  const fiis = useCollection<FiiHolding>("fiis_invest", { sort: "ticker" });
  const dividends = useCollection<FiiDividend>("fii_dividends_invest", { sort: "-payment_date" });
  const { cdi, ipca, ready: ratesReady, error: ratesError } = useRates();

  const fixedPositions = positions(investments.list.data ?? [], cdi, ipca);
  const fixed = portfolioTotals(fixedPositions);
  const daily = fixedPositions.filter(
    (p) => p.investment.liquidity === "daily" && !p.pending && p.amount > 0,
  );
  const dailyPrincipal = daily.reduce((sum, p) => sum + p.amount, 0);
  const upcoming = fixedPositions
    .filter(
      (p) =>
        p.investment.liquidity === "maturity" &&
        !p.pending &&
        !p.matured &&
        p.daysUntilMaturity !== null &&
        !!p.investment.maturity,
    )
    .sort((a, b) =>
      (a.daysUntilMaturity ?? 0) - (b.daysUntilMaturity ?? 0) ||
      a.investment.name.localeCompare(b.investment.name),
    );
  const variable = fiiTotals(fiis.list.data ?? [], dividends.list.data ?? []);
  const resultGroups = [
    {
      label: "Renda fixa",
      rows: fixedPositions.map((p) => ({
        id: p.investment.id,
        name: p.investment.name,
        detail: p.pending ? "Aplicação pendente" : "Ganho líquido estimado",
        value: p.today?.netGain ?? null,
      })),
    },
    {
      label: "FIIs",
      rows: (fiis.list.data ?? []).map((fii) => ({
        id: fii.id,
        name: fii.ticker,
        detail: "Variação da cotação",
        value: holdingChange(fii),
      })),
    },
  ];
  const applied = fixed.amount + variable.cost;
  const cashBalance = settings.list.data?.[0]?.cash_balance ?? 0;
  const current = applied + cashBalance;
  const result = fixed.netGain + variable.change;
  const incomplete = fixed.incomplete;
  const failed = investments.list.isError || fiis.list.isError || dividends.list.isError || settings.list.isError || ratesError;
  const loading = investments.list.isPending || fiis.list.isPending || dividends.list.isPending || settings.list.isPending || !ratesReady;

  function openCash() {
    setCashInput(String(cashBalance));
    setCashError("");
    setCashOpen(true);
  }

  async function saveCash(e: React.FormEvent) {
    e.preventDefault();
    const value = Number(cashInput);
    if (!Number.isFinite(value) || value < 0) {
      setCashError("Informe um saldo válido.");
      return;
    }
    try {
      const record = settings.list.data?.[0];
      if (record) await settings.update.mutateAsync({ id: record.id, data: { cash_balance: value } });
      else await settings.create.mutateAsync({ cdi_rate: cdi, cash_balance: value });
      setCashOpen(false);
    } catch {
      setCashError("Não foi possível salvar o saldo.");
    }
  }

  if (failed) {
    return <p className="text-sm text-red-600">Não foi possível carregar a carteira.</p>;
  }

  if (loading) {
    return <p className="text-sm text-neutral-500 dark:text-neutral-400">Carregando carteira…</p>;
  }

  const summary = [
    { label: "Valor atual", value: brl(current), detail: "Aplicado + saldo" },
    { label: "Valor aplicado", value: brl(applied) },
    { label: "Resultado", value: incomplete ? "Estimativa pendente" : brl(result) },
    { label: "Proventos recebidos", value: brl(variable.dividends) },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Geral</h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Renda fixa + FIIs
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {summary.map((item) => (
          <Card key={item.label} className="p-4">
            <p className="text-xs text-neutral-500 dark:text-neutral-400">{item.label}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">{item.value}</p>
            {item.detail && (
              <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">{item.detail}</p>
            )}
          </Card>
        ))}
      </div>
      {incomplete && (
        <p className="text-sm text-amber-700 dark:text-amber-400">
          Informe o IPCA estimado em Renda fixa para completar a estimativa.
        </p>
      )}

      <Card className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold">Saldo da conta de investimentos</h2>
            <p className="mt-2 text-xl font-semibold tabular-nums">{brl(cashBalance)}</p>
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
              Informado manualmente
            </p>
          </div>
          <Button variant="ghost" onClick={openCash}>Editar</Button>
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="font-semibold">Resultado por ativo</h2>
        {resultGroups.some((group) => group.rows.length > 0) ? (
          <div className="mt-3 grid gap-5 sm:grid-cols-2">
            {resultGroups.map((group) => group.rows.length > 0 && (
              <div key={group.label}>
                <h3 className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                  {group.label}
                </h3>
                <ul className="mt-1 divide-y divide-neutral-100 dark:divide-neutral-800">
                  {group.rows.map((row) => (
                    <li key={row.id} className="flex justify-between gap-3 py-2 text-sm">
                      <span className="min-w-0">
                        <span className="block truncate">{row.name}</span>
                        <span className="block text-xs text-neutral-500 dark:text-neutral-400">
                          {row.detail}
                        </span>
                      </span>
                      <span className={`shrink-0 self-center text-right tabular-nums ${
                        row.value === null
                          ? "text-amber-700 dark:text-amber-400"
                          : row.value < 0
                            ? "text-red-600 dark:text-red-400"
                            : row.value > 0
                              ? "text-emerald-600 dark:text-emerald-400"
                              : ""
                      }`}>
                        {row.value === null ? "Estimativa pendente" : brl(row.value)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-neutral-500 dark:text-neutral-400">
            Nenhum ativo cadastrado.
          </p>
        )}
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="p-4">
          <h2 className="font-semibold">Disponível para resgate</h2>
          <p className="mt-3 text-xl font-semibold tabular-nums">{brl(dailyPrincipal)}</p>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            Principal aplicado · liquidez diária
          </p>
          {daily.length > 0 ? (
            <ul className="mt-4 divide-y divide-neutral-100 dark:divide-neutral-800">
              {daily.map((p) => (
                <li key={p.investment.id} className="flex justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0 truncate">{p.investment.name}</span>
                  <span className="shrink-0 tabular-nums">{brl(p.amount)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-neutral-500 dark:text-neutral-400">
              Nenhum título com liquidez diária.
            </p>
          )}
        </Card>
        <Card className="p-4">
          <h2 className="font-semibold">Próximas datas de resgate</h2>
          {upcoming.length > 0 ? (
            <ul className="mt-3 divide-y divide-neutral-100 dark:divide-neutral-800">
              {upcoming.map((p) => (
                <li key={p.investment.id} className="flex justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate">{p.investment.name}</span>
                    <span className="block tabular-nums text-xs text-neutral-500 dark:text-neutral-400">
                      {fmtDate(p.investment.maturity!)}
                      {p.daysUntilMaturity === 0 && " · hoje"}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block tabular-nums">
                      {p.atMaturity ? brl(p.atMaturity.net) : "Estimativa pendente"}
                    </span>
                    {p.atMaturity && (
                      <span className="block text-xs text-neutral-500 dark:text-neutral-400">
                        Líquido estimado
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-neutral-500 dark:text-neutral-400">
              Nenhum resgate agendado.
            </p>
          )}
        </Card>
      </div>

      {cashOpen && (
        <Modal title="Saldo da conta de investimentos" onClose={() => setCashOpen(false)}>
          <form onSubmit={saveCash} className="space-y-4">
            <Field label="Saldo (R$)">
              <Input
                type="number"
                min={0}
                step="0.01"
                required
                value={cashInput}
                onChange={(e) => setCashInput(e.target.value)}
              />
            </Field>
            {cashError && <p role="alert" className="text-sm text-red-600">{cashError}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setCashOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={settings.update.isPending || settings.create.isPending}>Salvar</Button>
            </div>
          </form>
        </Modal>
      )}

      <div>
        <h2 className="mb-3 text-lg font-semibold">Por modalidade</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Link to="/pf" className="block rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">
            <Card className="h-full p-4 transition hover:ring-neutral-400 dark:hover:ring-neutral-600">
              <div className="flex items-center justify-between gap-4">
                <h3 className="font-semibold">Renda fixa</h3>
                <span aria-hidden="true">→</span>
              </div>
              <p className="mt-3 text-xl font-semibold tabular-nums">{brl(fixed.amount)}</p>
              <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                Valor aplicado
              </p>
            </Card>
          </Link>
          <Link to="/pf/fiis" className="block rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">
            <Card className="h-full p-4 transition hover:ring-neutral-400 dark:hover:ring-neutral-600">
              <div className="flex items-center justify-between gap-4">
                <h3 className="font-semibold">FIIs</h3>
                <span aria-hidden="true">→</span>
              </div>
              <p className="mt-3 text-xl font-semibold tabular-nums">{brl(variable.value)}</p>
              <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                {brl(variable.cost)} aplicados · cotação informada
              </p>
            </Card>
          </Link>
        </div>
      </div>
    </div>
  );
}
