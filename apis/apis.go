package apis

import (
	"github.com/danielgtaylor/huma/v2"
	"github.com/syhily/kobato/apis/admin"
	"github.com/syhily/kobato/apis/content"
)

func AddAPIRoutes(api huma.API) {
	// Content routes.
	content.AddContentRoutes(huma.NewGroup(api, "/api/content"))
	// Admin routes.
	admin.AddAdminRoutes(huma.NewGroup(api, "/api/admin"))
}
