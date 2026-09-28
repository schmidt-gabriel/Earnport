package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

// FII holdings are snapshots (quantity, average cost and a manually entered
// quote). Cash distributions are separate dated records so their history is
// preserved when the quote or quantity changes.
func init() {
	m.Register(func(app core.App) error {
		rule := authRule()
		fiis := core.NewBaseCollection("fiis_invest")
		fiis.ListRule, fiis.ViewRule, fiis.CreateRule, fiis.UpdateRule, fiis.DeleteRule = rule, rule, rule, rule, rule
		fiis.Fields.Add(
			&core.TextField{Name: "ticker", Required: true, Presentable: true, Max: 12},
			&core.TextField{Name: "name", Max: 100},
			&core.TextField{Name: "broker", Max: 100},
			&core.NumberField{Name: "quantity", Required: true, OnlyInt: true, Min: ptr(1.0)},
			&core.NumberField{Name: "average_price", Required: true, Min: ptr(0.01)},
			&core.NumberField{Name: "current_price", Required: true, Min: ptr(0.01)},
			&core.DateField{Name: "quoted_at"},
			&core.TextField{Name: "notes", Max: 500},
			&core.AutodateField{Name: "created", OnCreate: true},
			&core.AutodateField{Name: "updated", OnCreate: true, OnUpdate: true},
		)
		fiis.AddIndex("idx_fiis_invest_ticker", true, "ticker", "")
		if err := app.Save(fiis); err != nil {
			return err
		}

		dividends := core.NewBaseCollection("fii_dividends_invest")
		dividends.ListRule, dividends.ViewRule, dividends.CreateRule, dividends.UpdateRule, dividends.DeleteRule = rule, rule, rule, rule, rule
		dividends.Fields.Add(
			&core.RelationField{Name: "fii", Required: true, CollectionId: fiis.Id, MaxSelect: 1, CascadeDelete: true},
			&core.DateField{Name: "payment_date", Required: true},
			&core.NumberField{Name: "amount", Required: true, Min: ptr(0.01)},
			&core.TextField{Name: "notes", Max: 500},
			&core.AutodateField{Name: "created", OnCreate: true},
			&core.AutodateField{Name: "updated", OnCreate: true, OnUpdate: true},
		)
		return app.Save(dividends)
	}, func(app core.App) error {
		for _, name := range []string{"fii_dividends_invest", "fiis_invest"} {
			col, err := app.FindCollectionByNameOrId(name)
			if err != nil {
				return err
			}
			if err := app.Delete(col); err != nil {
				return err
			}
		}
		return nil
	})
}
