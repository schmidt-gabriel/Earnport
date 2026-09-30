package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

// Cash held in the investment account is entered manually. Existing portfolios
// start with zero cash; the field is not derived from historical purchases.
func init() {
	m.Register(func(app core.App) error {
		return addField(app, "settings_invest", &core.NumberField{Name: "cash_balance", Min: ptr(0.0)})
	}, func(app core.App) error {
		return dropField(app, "settings_invest", "cash_balance")
	})
}
