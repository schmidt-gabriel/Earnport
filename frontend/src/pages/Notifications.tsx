import { useEffect, useState } from "react";
import { DEFAULT_CDI } from "../lib/invest";
import { useCollection } from "../lib/useCollection";
import { Button, Card, Field, Input } from "../components/ui";

type InvestSettings = { id: string; cdi_rate?: number; notification_webhook_url?: string };

export default function Notifications() {
  const settings = useCollection<InvestSettings>("settings_invest", { sort: "-updated" });
  const record = settings.list.data?.[0];
  const [url, setUrl] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setUrl(record?.notification_webhook_url ?? "");
  }, [record?.id, record?.notification_webhook_url]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const notificationWebhookURL = url.trim();
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
    setSaved(true);
  };

  const busy = settings.list.isPending || settings.update.isPending || settings.create.isPending;
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
                setSaved(false);
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
            <Button type="submit" disabled={busy}>Salvar</Button>
            {saved && <span className="text-sm text-emerald-700 dark:text-emerald-400">Salvo</span>}
          </div>
        </form>
      </Card>

      <p className="text-sm text-neutral-500 dark:text-neutral-400">
        Avisos de vencimento serão os primeiros envios. Novos eventos da carteira poderão ser adicionados a este mesmo webhook.
      </p>
    </div>
  );
}
