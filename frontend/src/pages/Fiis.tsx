import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { useCollection } from "../lib/useCollection";
import { brl, fmtDate, fromDateInput, pct, toDateInput } from "../lib/pb";
import {
  fiiTotals,
  holdingChange,
  holdingChangePct,
  holdingCost,
  holdingValue,
  type FiiDividend,
  type FiiHolding,
} from "../lib/fiis";
import { Button, Card, Field, Input, Modal, Select } from "../components/ui";

const emptyFii = {
  ticker: "",
  name: "",
  broker: "",
  quantity: "",
  average_price: "",
  current_price: "",
  quoted_at: "",
  notes: "",
};

const emptyDividend = {
  fii: "",
  payment_date: "",
  amount: "",
  notes: "",
};

const tone = (value: number) =>
  value < 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400";

export default function Fiis() {
  const holdings = useCollection<FiiHolding>("fiis_invest", { sort: "ticker" });
  const payments = useCollection<FiiDividend>("fii_dividends_invest", { sort: "-payment_date" });
  const qc = useQueryClient();
  const [fiiOpen, setFiiOpen] = useState(false);
  const [dividendOpen, setDividendOpen] = useState(false);
  const [editingFii, setEditingFii] = useState<FiiHolding | null>(null);
  const [editingDividend, setEditingDividend] = useState<FiiDividend | null>(null);
  const [fiiForm, setFiiForm] = useState<Record<string, string>>(emptyFii);
  const [dividendForm, setDividendForm] = useState<Record<string, string>>(emptyDividend);
  const [error, setError] = useState("");
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    if (searchParams.get("new") === "1") {
      openNewFii();
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const fiis = holdings.list.data ?? [];
  const dividends = payments.list.data ?? [];
  const totals = fiiTotals(fiis, dividends);
  const tickerById = new Map(fiis.map((fii) => [fii.id, fii.ticker]));
  const paidByFii = new Map<string, number>();
  for (const dividend of dividends) {
    paidByFii.set(dividend.fii, (paidByFii.get(dividend.fii) ?? 0) + dividend.amount);
  }

  function openNewFii() {
    setEditingFii(null);
    setFiiForm(emptyFii);
    setError("");
    setFiiOpen(true);
  }

  function openEditFii(fii: FiiHolding) {
    setEditingFii(fii);
    setFiiForm({
      ticker: fii.ticker,
      name: fii.name ?? "",
      broker: fii.broker ?? "",
      quantity: String(fii.quantity),
      average_price: String(fii.average_price),
      current_price: String(fii.current_price),
      quoted_at: toDateInput(fii.quoted_at),
      notes: fii.notes ?? "",
    });
    setError("");
    setFiiOpen(true);
  }

  async function saveFii(e: React.FormEvent) {
    e.preventDefault();
    const ticker = fiiForm.ticker.trim().toUpperCase();
    if (fiis.some((fii) => fii.ticker === ticker && fii.id !== editingFii?.id)) {
      setError("Ticker já cadastrado.");
      return;
    }
    const data = {
      ticker,
      name: fiiForm.name.trim(),
      broker: fiiForm.broker.trim(),
      quantity: Number(fiiForm.quantity),
      average_price: Number(fiiForm.average_price),
      current_price: Number(fiiForm.current_price),
      quoted_at: fromDateInput(fiiForm.quoted_at),
      notes: fiiForm.notes.trim(),
    };
    try {
      if (editingFii) await holdings.update.mutateAsync({ id: editingFii.id, data });
      else await holdings.create.mutateAsync(data);
      setFiiOpen(false);
    } catch {
      setError("Não foi possível salvar o FII.");
    }
  }

  function openNewDividend(fiiId = fiis[0]?.id ?? "") {
    setEditingDividend(null);
    setDividendForm({ ...emptyDividend, fii: fiiId });
    setError("");
    setDividendOpen(true);
  }

  function openEditDividend(dividend: FiiDividend) {
    setEditingDividend(dividend);
    setDividendForm({
      fii: dividend.fii,
      payment_date: toDateInput(dividend.payment_date),
      amount: String(dividend.amount),
      notes: dividend.notes ?? "",
    });
    setError("");
    setDividendOpen(true);
  }

  async function saveDividend(e: React.FormEvent) {
    e.preventDefault();
    const data = {
      fii: dividendForm.fii,
      payment_date: fromDateInput(dividendForm.payment_date),
      amount: Number(dividendForm.amount),
      notes: dividendForm.notes.trim(),
    };
    try {
      if (editingDividend) await payments.update.mutateAsync({ id: editingDividend.id, data });
      else await payments.create.mutateAsync(data);
      setDividendOpen(false);
    } catch {
      setError("Não foi possível salvar o provento.");
    }
  }

  async function deleteFii(fii: FiiHolding) {
    if (!window.confirm(`Excluir ${fii.ticker} e seus proventos associados?`)) return;
    await holdings.remove.mutateAsync(fii.id);
    qc.invalidateQueries({ queryKey: ["fii_dividends_invest"] });
  }

  async function deleteDividend(dividend: FiiDividend) {
    if (!window.confirm("Excluir este provento?")) return;
    await payments.remove.mutateAsync(dividend.id);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">FIIs</h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Renda variável · cotações e proventos manuais
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" disabled={fiis.length === 0} onClick={() => openNewDividend()}>
            + Provento
          </Button>
          <Button onClick={openNewFii}>+ FII</Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Valor atual", value: brl(totals.value) },
          { label: "Valor aplicado", value: brl(totals.cost) },
          { label: "Variação", value: `${brl(totals.change)} (${pct(totals.changePct)}%)`, color: tone(totals.change) },
          { label: "Proventos recebidos", value: brl(totals.dividends) },
        ].map((item) => (
          <Card key={item.label} className="p-4">
            <p className="text-xs text-neutral-500 dark:text-neutral-400">{item.label}</p>
            <p className={`mt-1 text-lg font-semibold tabular-nums ${item.color ?? ""}`}>{item.value}</p>
          </Card>
        ))}
      </div>

      {fiis.length === 0 ? (
        <Card className="p-10 text-center text-sm text-neutral-500 dark:text-neutral-400">
          Nenhum FII cadastrado.
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {fiis.map((fii) => (
            <Card key={fii.id} className="flex flex-col p-4">
              <div>
                <h2 className="font-semibold">{fii.ticker}</h2>
                {(fii.name || fii.broker) && (
                  <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                    {[fii.name, fii.broker].filter(Boolean).join(" · ")}
                  </p>
                )}
              </div>
              <p className="mt-4 text-2xl font-semibold tabular-nums">{brl(holdingValue(fii))}</p>
              <p className="mt-1 text-xs tabular-nums text-neutral-500 dark:text-neutral-400">
                {fii.quantity} cotas · {brl(fii.current_price)} por cota
                {fii.quoted_at && ` · ${fmtDate(fii.quoted_at)}`}
              </p>
              <div className="mt-3 space-y-1 text-xs tabular-nums text-neutral-500 dark:text-neutral-400">
                <p>{brl(holdingCost(fii))} aplicados · PM {brl(fii.average_price)}</p>
                <p className={tone(holdingChange(fii))}>
                  Variação {brl(holdingChange(fii))} ({pct(holdingChangePct(fii))}%)
                </p>
                <p>Proventos recebidos {brl(paidByFii.get(fii.id) ?? 0)}</p>
              </div>
              <div className="mt-4 flex flex-wrap justify-end gap-1 border-t border-neutral-100 pt-3 dark:border-neutral-800">
                <Button variant="ghost" onClick={() => openNewDividend(fii.id)}>Provento</Button>
                <Button variant="ghost" onClick={() => openEditFii(fii)}>Editar</Button>
                <Button variant="danger" onClick={() => deleteFii(fii)}>Excluir</Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <div>
        <h2 className="mb-3 text-lg font-semibold">Proventos</h2>
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[550px] text-sm">
            <thead className="bg-neutral-50 text-neutral-500 dark:bg-neutral-800/50 dark:text-neutral-400">
              <tr>
                <th className="px-4 py-3 text-left">Pagamento</th>
                <th className="px-4 py-3 text-left">FII</th>
                <th className="px-4 py-3 text-right">Recebido</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {dividends.map((dividend) => (
                <tr key={dividend.id} className="border-t border-neutral-100 dark:border-neutral-800">
                  <td className="px-4 py-2 tabular-nums">{fmtDate(dividend.payment_date)}</td>
                  <td className="px-4 py-2 font-medium">{tickerById.get(dividend.fii) ?? "FII excluído"}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{brl(dividend.amount)}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-right">
                    <Button variant="ghost" onClick={() => openEditDividend(dividend)}>Editar</Button>
                    <Button variant="danger" onClick={() => deleteDividend(dividend)}>Excluir</Button>
                  </td>
                </tr>
              ))}
              {dividends.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-neutral-400 dark:text-neutral-500">
                    Nenhum provento registrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      </div>

      {fiiOpen && (
        <Modal title={editingFii ? "Editar FII" : "Novo FII"} onClose={() => setFiiOpen(false)}>
          <form onSubmit={saveFii} className="space-y-4">
            <Field label="Ticker">
              <Input required maxLength={12} placeholder="HGLG11" value={fiiForm.ticker}
                onChange={(e) => setFiiForm({ ...fiiForm, ticker: e.target.value.toUpperCase() })} />
            </Field>
            <Field label="Nome">
              <Input maxLength={100} value={fiiForm.name}
                onChange={(e) => setFiiForm({ ...fiiForm, name: e.target.value })} />
            </Field>
            <Field label="Corretora">
              <Input maxLength={100} value={fiiForm.broker}
                onChange={(e) => setFiiForm({ ...fiiForm, broker: e.target.value })} />
            </Field>
            <Field label="Quantidade de cotas">
              <Input required type="number" min={1} step={1} value={fiiForm.quantity}
                onChange={(e) => setFiiForm({ ...fiiForm, quantity: e.target.value })} />
            </Field>
            <Field label="Preço médio (R$)">
              <Input required type="number" min={0.01} step="0.01" value={fiiForm.average_price}
                onChange={(e) => setFiiForm({ ...fiiForm, average_price: e.target.value })} />
            </Field>
            <Field label="Cotação atual (R$)">
              <Input required type="number" min={0.01} step="0.01" value={fiiForm.current_price}
                onChange={(e) => setFiiForm({ ...fiiForm, current_price: e.target.value })} />
            </Field>
            <Field label="Data da cotação">
              <Input type="date" value={fiiForm.quoted_at}
                onChange={(e) => setFiiForm({ ...fiiForm, quoted_at: e.target.value })} />
            </Field>
            <Field label="Notas">
              <Input maxLength={500} value={fiiForm.notes}
                onChange={(e) => setFiiForm({ ...fiiForm, notes: e.target.value })} />
            </Field>
            {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => setFiiOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={holdings.create.isPending || holdings.update.isPending}>Salvar</Button>
            </div>
          </form>
        </Modal>
      )}

      {dividendOpen && (
        <Modal title={editingDividend ? "Editar provento" : "Novo provento"} onClose={() => setDividendOpen(false)}>
          <form onSubmit={saveDividend} className="space-y-4">
            <Field label="FII">
              <Select required value={dividendForm.fii}
                onChange={(e) => setDividendForm({ ...dividendForm, fii: e.target.value })}>
                {fiis.map((fii) => <option key={fii.id} value={fii.id}>{fii.ticker}</option>)}
              </Select>
            </Field>
            <Field label="Data do pagamento">
              <Input required type="date" value={dividendForm.payment_date}
                onChange={(e) => setDividendForm({ ...dividendForm, payment_date: e.target.value })} />
            </Field>
            <Field label="Valor recebido (R$)">
              <Input required type="number" min={0.01} step="0.01" value={dividendForm.amount}
                onChange={(e) => setDividendForm({ ...dividendForm, amount: e.target.value })} />
            </Field>
            <Field label="Notas">
              <Input maxLength={500} value={dividendForm.notes}
                onChange={(e) => setDividendForm({ ...dividendForm, notes: e.target.value })} />
            </Field>
            {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => setDividendOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={payments.create.isPending || payments.update.isPending}>Salvar</Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
