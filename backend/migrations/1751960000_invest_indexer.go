package migrations

import (
	"fmt"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

// Separate the product (CDB or LCI/LCA) from its yield indexer. Keep cdi_pct
// for importing older backups; new records use rate_pct and indexer.
func init() {
	m.Register(func(app core.App) error {
		col, err := app.FindCollectionByNameOrId("investments_invest")
		if err != nil {
			return err
		}
		legacy, ok := col.Fields.GetByName("cdi_pct").(*core.NumberField)
		if !ok {
			return fmt.Errorf("investments_invest.cdi_pct is not a number field")
		}
		legacy.Required = false
		col.Fields.Add(
			&core.SelectField{Name: "indexer", MaxSelect: 1, Values: []string{"cdi", "ipca", "fixed"}},
			&core.NumberField{Name: "rate_pct", Min: ptr(0.0)},
		)
		if err := app.Save(col); err != nil {
			return err
		}
		records, err := app.FindAllRecords("investments_invest")
		if err != nil {
			return err
		}
		for _, rec := range records {
			rec.Set("indexer", "cdi")
			rec.Set("rate_pct", rec.GetFloat("cdi_pct"))
			if err := app.Save(rec); err != nil {
				return err
			}
		}
		if err := addField(app, "settings_invest", &core.NumberField{Name: "ipca_rate", Min: ptr(0.0)}); err != nil {
			return err
		}
		return addField(app, "settings_invest", &core.BoolField{Name: "ipca_rate_set"})
	}, func(app core.App) error {
		if err := dropField(app, "settings_invest", "ipca_rate_set"); err != nil {
			return err
		}
		if err := dropField(app, "settings_invest", "ipca_rate"); err != nil {
			return err
		}
		col, err := app.FindCollectionByNameOrId("investments_invest")
		if err != nil {
			return err
		}
		records, err := app.FindAllRecords("investments_invest")
		if err != nil {
			return err
		}
		for _, rec := range records {
			if rec.GetString("indexer") == "cdi" {
				rec.Set("cdi_pct", rec.GetFloat("rate_pct"))
				if err := app.Save(rec); err != nil {
					return err
				}
			}
		}
		col.Fields.RemoveByName("indexer")
		col.Fields.RemoveByName("rate_pct")
		legacy, ok := col.Fields.GetByName("cdi_pct").(*core.NumberField)
		if !ok {
			return fmt.Errorf("investments_invest.cdi_pct is not a number field")
		}
		legacy.Required = true
		return app.Save(col)
	})
}
