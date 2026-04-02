package admin

import (
	"github.com/danielgtaylor/huma/v2"
	"github.com/syhily/kobato/apis/schema"
)

func AddAdminRoutes(api *huma.Group) {
	api.UseSimpleModifier(func(o *huma.Operation) {
		o.Summary = "Admin API - " + o.Summary
		o.Errors = schema.AdminErrorCodes
	})

	// TODO: Add admin auth middleware.

	addPostsRoutes(api)
	addPagesRoutes(api)
	addTagsRoutes(api)
	addMembersRoutes(api)
	addNewslettersRoutes(api)
	addUsersRoutes(api)
	addRolesRoutes(api)
	addInvitesRoutes(api)
	addWebhooksRoutes(api)
	addSiteRoutes(api)
	addSettingsRoutes(api)
	addImagesRoutes(api)
	addCommentsRoutes(api)
	addIntegrationsRoutes(api)
	addStatsRoutes(api)
	addLabelsRoutes(api)
	addAutomatedEmailsRoutes(api)
	addThemesRoutes(api)
	addNotificationsRoutes(api)
	addDBRoutes(api)
	addSessionRoutes(api)
	addEmailsRoutes(api)
	addSnippetsRoutes(api)
	addRecommendationsRoutes(api)
	addSearchIndexRoutes(api)
	addMiscRoutes(api)
}
