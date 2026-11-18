package api

import (
	"net/http/httptest"
	"testing"
	"time"

	"github.com/pocketbase/pocketbase/core"
)

// Tesouro Direto widens investments_invest.kind/indexer in place and adds the
// optional Selic estimate to settings_invest; a Tesouro Selic title still gets
// its maturity notices like any other position.
func TestTesouroSchemaAndNotice(t *testing.T) {
	app := newTestApp(t)
	hook := &webhookRecorder{}
	srv := httptest.NewServer(hook)
	defer srv.Close()
	setWebhook(t, app, srv.URL)

	settings, err := app.FindFirstRecordByFilter("settings_invest", "id != ''")
	if err != nil {
		t.Fatal(err)
	}
	settings.Set("selic_rate", 15)
	settings.Set("selic_rate_set", true)
	if err := app.Save(settings); err != nil {
		t.Fatalf("saving selic estimate: %v", err)
	}
	settings, _ = app.FindRecordById("settings_invest", settings.Id)
	if settings.GetFloat("selic_rate") != 15 || !settings.GetBool("selic_rate_set") {
		t.Errorf("selic estimate not stored: %v", settings.FieldsData())
	}

	rec := addInvestment(t, app, "Tesouro Selic 2029", 10000, "2026-10-12 00:00:00.000Z")
	rec.Set("kind", "tesouro")
	rec.Set("indexer", "selic")
	rec.Set("rate_pct", 0.05)
	rec.Set("liquidity", "daily")
	if err := app.Save(rec); err != nil {
		t.Fatalf("saving tesouro/selic: %v", err)
	}

	// Values outside the widened select are still rejected.
	col, _ := app.FindCollectionByNameOrId("investments_invest")
	bad := core.NewRecord(col)
	bad.Set("name", "Poupança")
	bad.Set("kind", "poupanca")
	if err := app.Save(bad); err == nil {
		t.Error("unknown kind was accepted")
	}

	sent, err := notifyUpcomingMaturities(app, srv.Client(), time.Date(2026, 10, 9, 6, 0, 0, 0, time.Local))
	if err != nil || sent != 1 {
		t.Fatalf("sent=%d err=%v, want 1 notice", sent, err)
	}
	if n := hook.payloads[0]; n.Investment.Kind != "tesouro" || n.Investment.Name != "Tesouro Selic 2029" {
		t.Errorf("unexpected payload %+v", n)
	}
}
