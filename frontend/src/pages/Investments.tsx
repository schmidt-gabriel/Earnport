import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useCollection } from "../lib/useCollection";
import { brl, fromDateInput, toDateInput } from "../lib/pb";
import {
  contractedRateOf,
  indexerOf,
  indexersFor,
  portfolioTotals,
  positions,
  type Indexer,
  type Investment,
  type InvestKind,
} from "../lib/invest";
import { NoInvestments, PositionCard, useRates } from "../components/invest";
import { Button, Field, Input, Modal, Select } from "../components/ui";

const empty = {
  name: "",
  broker: "",
  kind: "cdb",
  indexer: "cdi",
  rate_pct: "100",
  amount: "",
  applied_at: "",
  liquidity: "maturity",
  maturity: "",
  ipca_rate: "",
  selic_rate: "",
};

const indexerOptions: Record<Indexer, string> = {
  cdi: "CDI",
  selic: "Selic + taxa",
  ipca: "IPCA + taxa",
  fixed: "Prefixado",
};

const rateFieldLabel: Record<Indexer, string> = {
  cdi: "Taxa (% do CDI)",
  selic: "Taxa adicional (% a.a.)",
  ipca: "Taxa adicional (% a.a.)",
  fixed: "Taxa fixa (% a.a.)",
};

// Purchased fixed-income positions lead with invested principal.
// The optional IPCA and Selic references remain in the investment modal.
export default function Investments() {
  const { list, create, update, remove } = useCollection<Investment>(
    "investments_invest",
    { sort: "name" },
  );
  const { rates, ipca, selic, saveReference } = useRates();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Investment | null>(null);
  const [form, setForm] = useState<Record<string, string>>(empty);
  // Whether the user picked a liquidity by hand; only then a kind change
  // stops applying the kind's default liquidity.
  const [liquidityTouched, setLiquidityTouched] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  // The sidebar "+" links here with ?new=1, so react to the query string.
  useEffect(() => {
    if (searchParams.get("new") === "1") {
      openNew();
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  function openNew() {
    setEditing(null);
    setLiquidityTouched(false);
    setForm({ ...empty, ...referenceInputs() });
    setOpen(true);
  }

  function openEdit(inv: Investment) {
    setEditing(inv);
    setLiquidityTouched(false);
    setForm({
      name: inv.name,
      broker: inv.broker ?? "",
      kind: inv.kind,
      indexer: indexerOf(inv),
      rate_pct: String(contractedRateOf(inv)),
      amount: inv.amount ? String(inv.amount) : "",
      applied_at: toDateInput(inv.applied_at),
      liquidity: inv.liquidity ?? "maturity",
      maturity: toDateInput(inv.maturity),
      ...referenceInputs(),
    });
    setOpen(true);
  }

  function referenceInputs() {
    return {
      ipca_rate: ipca === null ? "" : String(ipca),
      selic_rate: selic === null ? "" : String(selic),
    };
  }

  // Each kind offers its own indexers (Selic only for Tesouro, CDI never), so
  // a kind change that invalidates the indexer falls back to the kind's first
  // one. On a new record whose liquidity was not picked by hand, Tesouro
  // defaults to daily liquidity and the other kinds to the form default.
  function changeKind(kind: string) {
    const allowed = indexersFor(kind as InvestKind);
    const keepIndexer = allowed.includes(form.indexer as Indexer);
    const applyDefault = !editing && !liquidityTouched;
    setForm({
      ...form,
      kind,
      indexer: keepIndexer ? form.indexer : allowed[0],
      rate_pct: keepIndexer ? form.rate_pct : "",
      liquidity: applyDefault
        ? (kind === "tesouro" ? "daily" : empty.liquidity)
        : form.liquidity,
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const data = {
      name: form.name,
      broker: form.broker,
      kind: form.kind,
      indexer: form.indexer,
      rate_pct: Number(form.rate_pct),
      // Retained only for importing old backups that still contain cdi_pct.
      cdi_pct: form.indexer === "cdi" ? Number(form.rate_pct) : 0,
      amount: form.amount ? Number(form.amount) : 0,
      applied_at: form.applied_at ? fromDateInput(form.applied_at) : "",
      liquidity: form.liquidity,
      maturity: form.maturity ? fromDateInput(form.maturity) : "",
    };
    if (editing) await update.mutateAsync({ id: editing.id, data });
    else await create.mutateAsync(data);
    if (form.indexer === "ipca") {
      await saveReference("ipca", form.ipca_rate === "" ? null : Number(form.ipca_rate));
    }
    if (form.indexer === "selic") {
      await saveReference("selic", form.selic_rate === "" ? null : Number(form.selic_rate));
    }
    setOpen(false);
  }

  const carteira = positions(list.data ?? [], rates);
  const total = portfolioTotals(carteira);
  // Corretoras já usadas, para sugerir no formulário.
  const brokers = [
    ...new Set((list.data ?? []).map((i) => i.broker?.trim()).filter(Boolean)),
  ].sort() as string[];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Renda fixa</h1>
          {/* A carteira em uma linha. */}
          <p className="mt-1 text-sm tabular-nums text-neutral-500 dark:text-neutral-400">
            {brl(total.amount)} aplicados
          </p>
        </div>
        <Button onClick={openNew}>+ Adicionar</Button>
      </div>

      {carteira.length === 0 ? (
        <NoInvestments onAdd={openNew} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {carteira.map((p) => (
            <PositionCard
              key={p.investment.id}
              position={p}
              actions={
                <>
                  <Button variant="ghost" onClick={() => openEdit(p.investment)}>
                    Editar
                  </Button>
                  <Button variant="danger" onClick={() => remove.mutate(p.investment.id)}>
                    Excluir
                  </Button>
                </>
              }
            />
          ))}
        </div>
      )}

      {open && (
        <Modal
          title={editing ? "Editar investimento" : "Novo investimento"}
          onClose={() => setOpen(false)}
        >
          <form onSubmit={submit} className="space-y-4">
            <Field label="Nome">
              <Input
                required
                placeholder="Nome"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>
            <Field label="Corretora">
              <Input
                list="invest-brokers"
                placeholder="XP"
                value={form.broker}
                onChange={(e) => setForm({ ...form, broker: e.target.value })}
              />
            </Field>
            <datalist id="invest-brokers">
              {brokers.map((b) => (
                <option key={b} value={b} />
              ))}
            </datalist>
            <Field label="Tipo">
              <Select
                value={form.kind}
                onChange={(e) => changeKind(e.target.value)}
              >
                <option value="cdb">CDB (IR regressivo)</option>
                <option value="lci_lca">LCI/LCA (isento)</option>
                <option value="tesouro">Tesouro (IR regressivo)</option>
              </Select>
            </Field>
            <Field label="Indexador">
              <Select
                value={form.indexer}
                onChange={(e) => setForm({ ...form, indexer: e.target.value, rate_pct: "" })}
              >
                {indexersFor(form.kind as InvestKind).map((i) => (
                  <option key={i} value={i}>{indexerOptions[i]}</option>
                ))}
              </Select>
            </Field>
            <Field label={rateFieldLabel[form.indexer as Indexer] ?? "Taxa"}>
              <Input
                type="number"
                step={form.indexer === "selic" ? "0.0001" : "0.01"}
                min={0}
                required
                value={form.rate_pct}
                onChange={(e) => setForm({ ...form, rate_pct: e.target.value })}
              />
            </Field>
            {form.indexer === "ipca" && (
              <Field label="IPCA est. (% a.a.)">
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  placeholder="Informar"
                  value={form.ipca_rate}
                  onChange={(e) => setForm({ ...form, ipca_rate: e.target.value })}
                />
              </Field>
            )}
            {form.indexer === "selic" && (
              <Field label="Selic est. (% a.a.)">
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  placeholder="Informar"
                  value={form.selic_rate}
                  onChange={(e) => setForm({ ...form, selic_rate: e.target.value })}
                />
              </Field>
            )}
            <Field label="Valor aplicado (R$)">
              <Input
                type="number"
                step="0.01"
                min={0}
                required
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
            </Field>
            <Field label="Data da aplicação">
              <Input
                type="date"
                required
                value={form.applied_at}
                onChange={(e) => setForm({ ...form, applied_at: e.target.value })}
              />
            </Field>
            <Field label="Liquidez">
              <Select
                value={form.liquidity}
                onChange={(e) => {
                  setLiquidityTouched(true);
                  setForm({ ...form, liquidity: e.target.value });
                }}
              >
                <option value="maturity">No vencimento</option>
                <option value="daily">Diária</option>
                <option value="market">Mercado</option>
              </Select>
            </Field>
            <Field label="Vencimento">
              <Input
                type="date"
                required={form.liquidity === "maturity"}
                value={form.maturity}
                onChange={(e) => setForm({ ...form, maturity: e.target.value })}
              />
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit">Salvar</Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
