package migrations

import (
	"fmt"
	"slices"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

// Tesouro Direto as a third kind of fixed-income title. The select values are
// widened in place, so no record loses its kind or indexer. `selic` is only
// meaningful for kind `tesouro`; the form enforces that pairing.
//
// The optional Selic estimate follows the IPCA one: selic_rate plus a
// selic_rate_set flag, so "not informed" is distinct from 0%.
func init() {
	m.Register(func(app core.App) error {
		if err := setSelectValues(app, "investments_invest", "kind", []string{"cdb", "lci_lca", "tesouro"}); err != nil {
			return err
		}
		if err := setSelectValues(app, "investments_invest", "indexer", []string{"cdi", "ipca", "fixed", "selic"}); err != nil {
			return err
		}
		if err := addField(app, "settings_invest", &core.NumberField{Name: "selic_rate", Min: ptr(0.0)}); err != nil {
			return err
		}
		return addField(app, "settings_invest", &core.BoolField{Name: "selic_rate_set"})
	}, func(app core.App) error {
		if err := dropField(app, "settings_invest", "selic_rate_set"); err != nil {
			return err
		}
		if err := dropField(app, "settings_invest", "selic_rate"); err != nil {
			return err
		}
		// Existing Tesouro titles are left in place on rollback (nothing is
		// deleted); the narrower values only reject them on their next save.
		if err := setSelectValues(app, "investments_invest", "indexer", []string{"cdi", "ipca", "fixed"}); err != nil {
			return err
		}
		return setSelectValues(app, "investments_invest", "kind", []string{"cdb", "lci_lca"})
	})
}

// setSelectValues replaces the allowed values of an existing select field,
// keeping the field (and the data in it) in place.
func setSelectValues(app core.App, collection, field string, values []string) error {
	col, err := app.FindCollectionByNameOrId(collection)
	if err != nil {
		return err
	}
	sel, ok := col.Fields.GetByName(field).(*core.SelectField)
	if !ok {
		return fmt.Errorf("%s.%s is not a select field", collection, field)
	}
	sel.Values = slices.Clone(values)
	return app.Save(col)
}
