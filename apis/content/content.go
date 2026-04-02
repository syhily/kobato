package content

import (
	"github.com/danielgtaylor/huma/v2"
	"github.com/syhily/kobato/apis/schema"
)

func AddContentRoutes(api *huma.Group) {
	api.UseSimpleModifier(func(o *huma.Operation) {
		o.Summary = "Content API - Using for read-only access to content."
		o.Tags = append(o.Tags, "Content")
		o.Errors = schema.ContentErrorCodes
	})

	// TODO Add content auth middleware. It's designed to be used with the Integration API key.
	//  Currently, the Integration API key is not implemented.
	//  We need to implement the database first.

	// Register the content routes.
	addPostsRoutes(api)
	addPagesRoutes(api)
	addTagsRoutes(api)
	addAuthorsRoutes(api)
	addSettingsRoutes(api)
	addNewslettersRoutes(api)
	addRecommendationsRoutes(api)
	addSearchIndexRoutes(api)
}
