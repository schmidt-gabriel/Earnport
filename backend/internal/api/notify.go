package api

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/pocketbase/pocketbase/core"
)

// maturityNoticeDays are how many calendar days before maturity a fixed-income
// position is announced on the investment webhook, from the earliest notice to
// the maturity day itself.
var maturityNoticeDays = []int{7, 3, 1, 0}

// maturityNoticeThreshold maps the days left until maturity to the notice it
// belongs to: the tightest threshold that still covers it. A day the routine
// did not run (server down) therefore still yields the right notice later.
// Positions outside every window (or already matured) get none.
func maturityNoticeThreshold(days int) (int, bool) {
	if days < 0 {
		return 0, false
	}
	threshold, ok := 0, false
	for _, d := range maturityNoticeDays {
		if days <= d {
			threshold, ok = d, true
		}
	}
	return threshold, ok
}

// daysUntil counts calendar days from today's local date to a PocketBase
// datetime, comparing dates only (the stored date part is the calendar date
// the user picked, the same way the frontend's parseDate reads it).
func daysUntil(today time.Time, pbDate string) int {
	from := time.Date(today.Year(), today.Month(), today.Day(), 0, 0, 0, 0, time.UTC)
	to, err := time.Parse("2006-01-02", pbDate[:min(10, len(pbDate))])
	if err != nil {
		return -1
	}
	return int(to.Sub(from).Hours() / 24)
}

// maturityNotice is the JSON body POSTed to the investment webhook. `text` is
// a ready-to-show message (Slack/Mattermost/Google Chat read it as is); the
// rest carries the same facts structured for automations.
type maturityNotice struct {
	Event             string           `json:"event"`
	Text              string           `json:"text"`
	DaysUntilMaturity int              `json:"days_until_maturity"`
	Investment        noticeInvestment `json:"investment"`
}

type noticeInvestment struct {
	ID        string  `json:"id"`
	Name      string  `json:"name"`
	Broker    string  `json:"broker"`
	Kind      string  `json:"kind"`
	Liquidity string  `json:"liquidity"`
	Amount    float64 `json:"amount"`
	Maturity  string  `json:"maturity"` // YYYY-MM-DD
}

func maturityText(inv noticeInvestment, days int) string {
	label := inv.Name
	if inv.Broker != "" {
		label = fmt.Sprintf("%s (%s)", inv.Name, inv.Broker)
	}
	date, _ := time.Parse("2006-01-02", inv.Maturity)
	when := fmt.Sprintf("vence em %d dias", days)
	switch days {
	case 0:
		when = "vence hoje"
	case 1:
		when = "vence amanhã"
	}
	return fmt.Sprintf("%s %s (%s).", label, when, date.Format("02/01/2006"))
}

// notifyUpcomingMaturities POSTs a notice to the investment webhook for every
// position whose maturity falls inside a notice window, once per window. An
// empty webhook URL disables it. A failed delivery is not recorded, so the next
// run retries it. Returns how many notices were delivered.
func notifyUpcomingMaturities(app core.App, client *http.Client, today time.Time) (int, error) {
	settings, err := app.FindFirstRecordByFilter("settings_invest", "id != ''")
	if errors.Is(err, sql.ErrNoRows) {
		return 0, nil
	}
	if err != nil {
		return 0, err
	}
	url := strings.TrimSpace(settings.GetString("notification_webhook_url"))
	if url == "" {
		return 0, nil
	}

	investments, err := app.FindAllRecords("investments_invest")
	if err != nil {
		return 0, err
	}
	logCol, err := app.FindCollectionByNameOrId("notifications_invest")
	if err != nil {
		return 0, err
	}

	sent := 0
	for _, inv := range investments {
		maturity := inv.GetString("maturity")
		if maturity == "" || inv.GetFloat("amount") <= 0 {
			continue // no maturity, or not a real position yet
		}
		days := daysUntil(today, maturity)
		threshold, ok := maturityNoticeThreshold(days)
		if !ok {
			continue
		}
		// The maturity date is part of the key so editing it re-arms the notices.
		key := fmt.Sprintf("maturity:%s:%s:%d", inv.Id, maturity[:10], threshold)
		if _, err := app.FindFirstRecordByData(logCol, "key", key); err == nil {
			continue // already delivered
		} else if !errors.Is(err, sql.ErrNoRows) {
			return sent, err
		}

		info := noticeInvestment{
			ID:        inv.Id,
			Name:      inv.GetString("name"),
			Broker:    inv.GetString("broker"),
			Kind:      inv.GetString("kind"),
			Liquidity: inv.GetString("liquidity"),
			Amount:    inv.GetFloat("amount"),
			Maturity:  maturity[:10],
		}
		notice := maturityNotice{
			Event:             "investment.maturity",
			Text:              maturityText(info, days),
			DaysUntilMaturity: days,
			Investment:        info,
		}
		if err := postWebhook(client, url, notice); err != nil {
			return sent, fmt.Errorf("maturity notice for %q: %w", info.Name, err)
		}

		entry := core.NewRecord(logCol)
		entry.Set("key", key)
		entry.Set("event", notice.Event)
		if err := app.Save(entry); err != nil {
			return sent, err
		}
		sent++
		app.Logger().Info("sent maturity notice", "investment", info.Name, "days", days)
	}
	return sent, nil
}

func postWebhook(client *http.Client, url string, body any) error {
	payload, err := json.Marshal(body)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	res, err := client.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode > 299 {
		return fmt.Errorf("webhook answered %s", res.Status)
	}
	return nil
}
