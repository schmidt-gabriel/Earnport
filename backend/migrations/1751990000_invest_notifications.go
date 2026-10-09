package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

// The investment webhook is configured before notification producers exist.
// An empty URL means notifications are disabled; future events (maturity,
// distributions, and other portfolio activity) share this single destination.
func init() {
	m.Register(func(app core.App) error {
		return addField(app, "settings_invest", &core.URLField{Name: "notification_webhook_url"})
	}, func(app core.App) error {
		return dropField(app, "settings_invest", "notification_webhook_url")
	})
}
