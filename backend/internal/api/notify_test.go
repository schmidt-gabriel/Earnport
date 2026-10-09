package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"github.com/pocketbase/pocketbase/core"

	_ "earnport/backend/migrations"
)

func TestMaturityNoticeThreshold(t *testing.T) {
	cases := []struct {
		days      int
		threshold int
		ok        bool
	}{
		{-1, 0, false}, // already matured: nothing new to warn about
		{0, 0, true},
		{1, 1, true},
		{2, 3, true}, // a missed day still falls into the 3-day notice
		{3, 3, true},
		{5, 7, true},
		{7, 7, true},
		{8, 0, false},
	}
	for _, c := range cases {
		got, ok := maturityNoticeThreshold(c.days)
		if ok != c.ok || (ok && got != c.threshold) {
			t.Errorf("days=%d: got (%d, %v), want (%d, %v)", c.days, got, ok, c.threshold, c.ok)
		}
	}
}

func TestDaysUntil(t *testing.T) {
	today := time.Date(2026, 10, 9, 23, 30, 0, 0, time.FixedZone("BRT", -3*3600))
	if got := daysUntil(today, "2026-10-12 00:00:00.000Z"); got != 3 {
		t.Errorf("daysUntil = %d, want 3", got)
	}
	if got := daysUntil(today, "2026-10-09 12:00:00.000Z"); got != 0 {
		t.Errorf("daysUntil same day = %d, want 0", got)
	}
}

// webhookRecorder is a fake webhook endpoint that keeps every payload it got.
type webhookRecorder struct {
	mu       sync.Mutex
	payloads []maturityNotice
	status   int
}

func (w *webhookRecorder) ServeHTTP(rw http.ResponseWriter, r *http.Request) {
	var n maturityNotice
	_ = json.NewDecoder(r.Body).Decode(&n)
	w.mu.Lock()
	w.payloads = append(w.payloads, n)
	status := w.status
	w.mu.Unlock()
	if status == 0 {
		status = http.StatusOK
	}
	rw.WriteHeader(status)
}

func newTestApp(t *testing.T) core.App {
	t.Helper()
	app := core.NewBaseApp(core.BaseAppConfig{DataDir: t.TempDir()})
	if err := app.Bootstrap(); err != nil {
		t.Fatal(err)
	}
	if err := app.RunAllMigrations(); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = app.ResetBootstrapState() })
	return app
}

func setWebhook(t *testing.T, app core.App, url string) {
	t.Helper()
	rec, err := app.FindFirstRecordByFilter("settings_invest", "id != ''")
	if err != nil {
		col, err := app.FindCollectionByNameOrId("settings_invest")
		if err != nil {
			t.Fatal(err)
		}
		rec = core.NewRecord(col)
	}
	rec.Set("notification_webhook_url", url)
	if err := app.Save(rec); err != nil {
		t.Fatal(err)
	}
}

func addInvestment(t *testing.T, app core.App, name string, amount float64, maturity string) *core.Record {
	t.Helper()
	col, err := app.FindCollectionByNameOrId("investments_invest")
	if err != nil {
		t.Fatal(err)
	}
	rec := core.NewRecord(col)
	rec.Set("name", name)
	rec.Set("broker", "XP")
	rec.Set("kind", "cdb")
	rec.Set("cdi_pct", 100)
	rec.Set("amount", amount)
	rec.Set("liquidity", "maturity")
	rec.Set("maturity", maturity)
	if err := app.Save(rec); err != nil {
		t.Fatal(err)
	}
	return rec
}

func TestNotifyUpcomingMaturities(t *testing.T) {
	app := newTestApp(t)
	hook := &webhookRecorder{}
	srv := httptest.NewServer(hook)
	defer srv.Close()
	setWebhook(t, app, srv.URL)

	today := time.Date(2026, 10, 9, 6, 0, 0, 0, time.Local)
	addInvestment(t, app, "CDB Banco A", 10000, "2026-10-12 00:00:00.000Z") // 3 days
	addInvestment(t, app, "CDB Banco B", 5000, "2026-12-01 00:00:00.000Z")  // far away
	addInvestment(t, app, "CDB Vencido", 5000, "2026-10-01 00:00:00.000Z")  // already matured
	addInvestment(t, app, "Sem valor", 0, "2026-10-10 00:00:00.000Z")       // not a real position

	sent, err := notifyUpcomingMaturities(app, srv.Client(), today)
	if err != nil {
		t.Fatal(err)
	}
	if sent != 1 || len(hook.payloads) != 1 {
		t.Fatalf("sent=%d payloads=%d, want 1 each", sent, len(hook.payloads))
	}
	n := hook.payloads[0]
	if n.Event != "investment.maturity" || n.DaysUntilMaturity != 3 || n.Investment.Name != "CDB Banco A" || n.Investment.Maturity != "2026-10-12" {
		t.Errorf("unexpected payload %+v", n)
	}
	if n.Text == "" {
		t.Error("payload should carry a human readable text")
	}

	// Running again the same day (startup + cron, or "Rodar agora") must not repeat it.
	sent, err = notifyUpcomingMaturities(app, srv.Client(), today)
	if err != nil {
		t.Fatal(err)
	}
	if sent != 0 || len(hook.payloads) != 1 {
		t.Errorf("rerun sent=%d payloads=%d, want no new notice", sent, len(hook.payloads))
	}

	// One day later it is still inside the 3-day notice: nothing new.
	if sent, _ = notifyUpcomingMaturities(app, srv.Client(), today.AddDate(0, 0, 1)); sent != 0 {
		t.Errorf("day 2 sent=%d, want 0", sent)
	}
	// The 1-day and same-day notices each go out once.
	if sent, _ = notifyUpcomingMaturities(app, srv.Client(), today.AddDate(0, 0, 2)); sent != 1 {
		t.Errorf("day before maturity sent=%d, want 1", sent)
	}
	if sent, _ = notifyUpcomingMaturities(app, srv.Client(), today.AddDate(0, 0, 3)); sent != 1 {
		t.Errorf("maturity day sent=%d, want 1", sent)
	}
	if got := hook.payloads[len(hook.payloads)-1].DaysUntilMaturity; got != 0 {
		t.Errorf("last notice days=%d, want 0", got)
	}
}

func TestNotifyUpcomingMaturitiesDisabledWithoutURL(t *testing.T) {
	app := newTestApp(t)
	addInvestment(t, app, "CDB Banco A", 10000, "2026-10-12 00:00:00.000Z")

	sent, err := notifyUpcomingMaturities(app, http.DefaultClient, time.Date(2026, 10, 9, 6, 0, 0, 0, time.Local))
	if err != nil || sent != 0 {
		t.Errorf("sent=%d err=%v, want nothing sent without a webhook", sent, err)
	}
}

// A webhook that fails is retried on the next run instead of being marked sent.
func TestNotifyUpcomingMaturitiesRetriesFailedDelivery(t *testing.T) {
	app := newTestApp(t)
	hook := &webhookRecorder{status: http.StatusBadGateway}
	srv := httptest.NewServer(hook)
	defer srv.Close()
	setWebhook(t, app, srv.URL)
	addInvestment(t, app, "CDB Banco A", 10000, "2026-10-12 00:00:00.000Z")
	today := time.Date(2026, 10, 9, 6, 0, 0, 0, time.Local)

	if _, err := notifyUpcomingMaturities(app, srv.Client(), today); err == nil {
		t.Fatal("expected an error from a failing webhook")
	}

	hook.mu.Lock()
	hook.status = http.StatusOK
	hook.mu.Unlock()
	sent, err := notifyUpcomingMaturities(app, srv.Client(), today)
	if err != nil || sent != 1 {
		t.Errorf("retry sent=%d err=%v, want 1 delivered", sent, err)
	}
}
