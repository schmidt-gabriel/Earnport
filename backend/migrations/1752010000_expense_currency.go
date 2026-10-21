package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

// Adds currency (BRL|USD) to expenses. A USD expense is paid straight from USD
// already received and not yet converted: it stays out of every BRL total
// (invoices, revenue, tax base, BRL expense totals) and only reduces the USD
// balance ("A trazer"). Empty (existing records) means BRL.
func init() {
	m.Register(func(app core.App) error {
		return addField(app, "expenses",
			&core.SelectField{Name: "currency", MaxSelect: 1, Values: []string{"BRL", "USD"}})
	}, func(app core.App) error {
		return dropField(app, "expenses", "currency")
	})
}
