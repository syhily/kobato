package apis

import (
	"github.com/danielgtaylor/huma/v2"
	"github.com/syhily/kobato/apis/admin"
	"github.com/syhily/kobato/apis/content"
)

const (
	apiOverview = `Kobato is a headless blogging platform inspired by the Ghost architecture and API design.

## What this API provides

- **Content API** (/api/content): read-only endpoints for public-facing blog consumption, including posts, pages, tags, authors, newsletters, and settings.
- **Admin API** (/api/admin): management endpoints for editorial and operational workflows, including content, members, sessions, themes, integrations, webhooks, and site-level configuration.

## Design goals

1. Keep API contracts explicit through schema-first definitions under apis/schema.
2. Preserve route organization via grouped modules in apis/content and apis/admin.
3. Provide a practical learning playground for understanding and re-implementing key Ghost ideas with Go + Huma + Fiber.

## Notes for clients

- Request and response validation is generated from Huma/OpenAPI schemas for predictable integrations.
- OpenAPI specs are available at /openapi.json and /openapi.yaml, with interactive docs at /docs.
- For production deployments, disable docs endpoints via --api-docs=false.
`
)

func AddAPIConfigs(config huma.Config, enable bool) {
	// The OpenAPI and docs should be disabled for a production running instance.
	if !enable {
		config.OpenAPIPath = ""
		config.DocsPath = ""
		config.SchemasPath = ""
	} else {
		config.Info.Description = apiOverview
		config.Info.TermsOfService = "https://github.com/syhily/kobato"
		config.Info.Contact = &huma.Contact{
			Name: "Kobato Maintainers",
			URL:  "https://github.com/syhily/kobato/issues",
		}
		config.Info.License = &huma.License{
			Name: "MIT",
			URL:  "https://opensource.org/licenses/MIT",
		}
	}
}

func AddAPIRoutes(api huma.API) {
	// Content routes.
	content.AddContentRoutes(huma.NewGroup(api, "/api/content"))
	// Admin routes.
	admin.AddAdminRoutes(huma.NewGroup(api, "/api/admin"))
}
