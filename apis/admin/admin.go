package admin

import "github.com/danielgtaylor/huma/v2"

func AddAdminRoutes(api *huma.Group) {
	api.UseSimpleModifier(func(o *huma.Operation) {
		o.Summary = "Admin API - Using for full access to content and settings."
		o.Tags = append(o.Tags, "Admin")
	})

	// TODO Add admin routes.
}
