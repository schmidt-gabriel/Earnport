package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

// Current value of a fixed-income position as seen at the broker, entered by
// hand. Optional: PocketBase stores an empty number as 0, and 0 means "not
// set" (the Geral totals fall back to the invested principal). Additive, so
// existing positions keep every value they had.
func init() {
	m.Register(func(app core.App) error {
		return addField(app, "investments_invest", &core.NumberField{Name: "current_value", Min: ptr(0.0)})
	}, func(app core.App) error {
		return dropField(app, "investments_invest", "current_value")
	})
}
