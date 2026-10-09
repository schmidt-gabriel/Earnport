package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

// notifications_invest remembers which webhook notices were already delivered,
// so the daily routine (which also runs at startup and on demand) never sends
// the same one twice. `key` identifies the notice, e.g.
// "maturity:<investment id>:<YYYY-MM-DD>:<threshold days>". It is operational
// state, not user data, so it stays out of exports and backups.
func init() {
	m.Register(func(app core.App) error {
		rule := authRule()
		col := core.NewBaseCollection("notifications_invest")
		col.ListRule, col.ViewRule, col.CreateRule, col.UpdateRule, col.DeleteRule = rule, rule, rule, rule, rule
		col.Fields.Add(
			&core.TextField{Name: "key", Required: true, Presentable: true, Max: 200},
			&core.TextField{Name: "event", Required: true, Max: 50},
			&core.AutodateField{Name: "sent_at", OnCreate: true},
		)
		col.AddIndex("idx_notifications_invest_key", true, "key", "")
		return app.Save(col)
	}, func(app core.App) error {
		if c, _ := app.FindCollectionByNameOrId("notifications_invest"); c != nil {
			return app.Delete(c)
		}
		return nil
	})
}
