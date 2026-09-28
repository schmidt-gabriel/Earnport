import { Link } from "react-router-dom";
import { Card } from "../components/ui";
import { useRates } from "../components/invest";
import { fiiTotals, type FiiDividend, type FiiHolding } from "../lib/fiis";
import { portfolioTotals, positions, type Investment } from "../lib/invest";
import { brl } from "../lib/pb";
import { useCollection } from "../lib/useCollection";

export default function PortfolioOverview() {
  const investments = useCollection<Investment>("investments_invest", { sort: "name" });
  const fiis = useCollection<FiiHolding>("fiis_invest", { sort: "ticker" });
  const dividends = useCollection<FiiDividend>("fii_dividends_invest", { sort: "-payment_date" });
  const { cdi, ipca, ready: ratesReady, error: ratesError } = useRates();

  const fixed = portfolioTotals(positions(investments.list.data ?? [], cdi, ipca));
  const variable = fiiTotals(fiis.list.data ?? [], dividends.list.data ?? []);
  const applied = fixed.amount + variable.cost;
  const current = fixed.net + variable.value;
  const incomplete = fixed.incomplete;
  const failed = investments.list.isError || fiis.list.isError || dividends.list.isError || ratesError;
  const loading = investments.list.isPending || fiis.list.isPending || dividends.list.isPending || !ratesReady;

  if (failed) {
    return <p className="text-sm text-red-600">Não foi possível carregar a carteira.</p>;
  }

  if (loading) {
    return <p className="text-sm text-neutral-500 dark:text-neutral-400">Carregando carteira…</p>;
  }

  const summary = [
    { label: "Valor atual", value: incomplete ? "Estimativa pendente" : brl(current) },
    { label: "Valor aplicado", value: brl(applied) },
    { label: "Resultado", value: incomplete ? "Estimativa pendente" : brl(current - applied) },
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
          </Card>
        ))}
      </div>
      {incomplete && (
        <p className="text-sm text-amber-700 dark:text-amber-400">
          Informe o IPCA estimado em Renda fixa para completar a estimativa.
        </p>
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
              <p className="mt-3 text-xl font-semibold tabular-nums">
                {incomplete ? "Estimativa pendente" : brl(fixed.net)}
              </p>
              <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                {brl(fixed.amount)} aplicados · valor líquido estimado
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
