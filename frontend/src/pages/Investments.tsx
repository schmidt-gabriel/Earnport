import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useCollection } from "../lib/useCollection";
import { brl, fromDateInput, toDateInput } from "../lib/pb";
import { contractedRateOf, indexerOf, portfolioTotals, positions, type Investment } from "../lib/invest";
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
};

// Purchased fixed-income positions lead with invested principal.
// The optional IPCA reference remains in the investment modal.
export default function Investments() {
  const { list, create, update, remove } = useCollection<Investment>(
    "investments_invest",
    { sort: "name" },
  );
  const { cdi, ipca, saveReference } = useRates();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Investment | null>(null);
  const [form, setForm] = useState<Record<string, string>>(empty);
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
    setForm({ ...empty, ipca_rate: ipca === null ? "" : String(ipca) });
    setOpen(true);
  }

  function openEdit(inv: Investment) {
    setEditing(inv);
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
      ipca_rate: ipca === null ? "" : String(ipca),
    });
    setOpen(true);
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
    setOpen(false);
  }

  const carteira = positions(list.data ?? [], cdi, ipca);
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
            {total.incomplete ? " · Estimativa pendente" : ` · ${brl(total.net)} líquidos estimados hoje`}
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
                onChange={(e) => setForm({ ...form, kind: e.target.value })}
              >
                <option value="cdb">CDB (IR regressivo)</option>
                <option value="lci_lca">LCI/LCA (isento)</option>
              </Select>
            </Field>
            <Field label="Indexador">
              <Select
                value={form.indexer}
                onChange={(e) => setForm({ ...form, indexer: e.target.value, rate_pct: "" })}
              >
                <option value="cdi">CDI</option>
                <option value="ipca">IPCA + taxa</option>
                <option value="fixed">Prefixado</option>
              </Select>
            </Field>
            <Field label={form.indexer === "cdi" ? "Taxa (% do CDI)" : form.indexer === "ipca" ? "Taxa adicional (% a.a.)" : "Taxa fixa (% a.a.)"}>
              <Input
                type="number"
                step="0.01"
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
                onChange={(e) => setForm({ ...form, liquidity: e.target.value })}
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
