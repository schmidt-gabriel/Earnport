import { useEffect, useState } from "react";
import type { ClientResponseError } from "pocketbase";
import { DEFAULT_CDI } from "../lib/invest";
import { pb } from "../lib/pb";
import { useCollection } from "../lib/useCollection";
import { Button, Card, Field, Input } from "../components/ui";

type InvestSettings = { id: string; cdi_rate?: number; notification_webhook_url?: string };

export default function Notifications() {
  const settings = useCollection<InvestSettings>("settings_invest", { sort: "-updated" });
  const record = settings.list.data?.[0];
  const [url, setUrl] = useState("");
  const [testing, setTesting] = useState(false);
  // Outcome of the last save or test, shown beside the buttons.
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    setUrl(record?.notification_webhook_url ?? "");
  }, [record?.id, record?.notification_webhook_url]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const notificationWebhookURL = url.trim();
    setStatus(null);
    try {
      if (record) {
        await settings.update.mutateAsync({
          id: record.id,
          data: { notification_webhook_url: notificationWebhookURL },
        });
      } else {
        await settings.create.mutateAsync({
          cdi_rate: DEFAULT_CDI,
          notification_webhook_url: notificationWebhookURL,
        });
      }
      setStatus({ ok: true, text: "Salvo" });
    } catch (err) {
      // PocketBase puts field validation (e.g. an invalid URL) under response.data.
      const e = err as ClientResponseError;
      const reason = e.response?.data?.notification_webhook_url?.message ?? e.message;
      setStatus({ ok: false, text: `Não foi possível salvar: ${reason}` });
    }
  };

  // Tests the URL as typed, so it can be checked before saving.
  const test = async () => {
    setTesting(true);
    setStatus(null);
    try {
      const res = await fetch("/api/invest/notifications/test", {
        method: "POST",
        headers: { Authorization: pb.authStore.token, "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      if (res.ok) {
        setStatus({ ok: true, text: "Teste enviado" });
      } else {
        const data = (await res.json().catch(() => null)) as { message?: string } | null;
        setStatus({ ok: false, text: `Falhou: ${data?.message ?? res.statusText}` });
      }
    } catch {
      setStatus({ ok: false, text: "Falhou: sem resposta do servidor" });
    } finally {
      setTesting(false);
    }
  };

  const saving = settings.update.isPending || settings.create.isPending;
  const busy = settings.list.isPending || saving;
  const configured = Boolean(record?.notification_webhook_url);

  return (
    <div className="max-w-xl space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Notificações</h2>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Envie os avisos da carteira de investimentos para um webhook.
        </p>
      </div>

      <Card className="p-5">
        <form onSubmit={save} className="space-y-4">
          <Field label="URL do webhook">
            <Input
              type="url"
              inputMode="url"
              placeholder="https://exemplo.com/webhook"
              value={url}
              onChange={(event) => {
                setUrl(event.target.value);
                setStatus(null);
              }}
              disabled={busy}
            />
          </Field>

          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            {configured
              ? "Webhook configurado. Apague a URL e salve para desativar."
              : "Nenhum webhook configurado."}
          </p>

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={busy}>
              {saving ? "Salvando…" : "Salvar"}
            </Button>
            <Button type="button" variant="ghost" onClick={test} disabled={busy || testing || !url.trim()}>
              {testing ? "Testando…" : "Testar"}
            </Button>
            {status && (
              <span
                className={`text-sm ${status.ok ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}
              >
                {status.text}
              </span>
            )}
          </div>
        </form>
      </Card>

      <p className="text-sm text-neutral-500 dark:text-neutral-400">
        Títulos com vencimento são avisados 7, 3 e 1 dia antes e no dia, uma vez cada, pela rotina diária das 06:00.
      </p>
    </div>
  );
}
