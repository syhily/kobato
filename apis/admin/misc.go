package admin

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/syhily/kobato/apis/schema"
)

func addMiscRoutes(api huma.API) {
	getConfigOp := huma.Operation{
		OperationID: "admin-get-config",
		Method:      http.MethodGet,
		Path:        "/config",
		Summary:     "Get admin config",
		Description: "Retrieve the admin configuration including editor settings, labs flags, and feature availability.",
		Tags:        []string{"Config"},
	}
	huma.Register(api, getConfigOp, func(_ context.Context, _ *schema.EmptyInput) (*schema.AdminConfigOutput, error) {
		return &schema.AdminConfigOutput{}, nil
	})

	getConfigFeaturebaseOp := huma.Operation{
		OperationID: "admin-get-config-featurebase",
		Method:      http.MethodGet,
		Path:        "/config/featurebase",
		Summary:     "Get featurebase config",
		Description: "Retrieve the Featurebase configuration and JWT token for the feedback widget.",
		Tags:        []string{"Config"},
	}
	huma.Register(api, getConfigFeaturebaseOp, func(_ context.Context, _ *schema.EmptyInput) (*schema.AdminFeaturebaseTokenOutput, error) {
		return &schema.AdminFeaturebaseTokenOutput{}, nil
	})

	getExploreOp := huma.Operation{
		OperationID: "admin-get-explore",
		Method:      http.MethodGet,
		Path:        "/explore",
		Summary:     "Get explore data",
		Description: "Retrieve explore page data for discovering other Ghost publications.",
		Tags:        []string{"Explore"},
	}
	huma.Register(api, getExploreOp, func(_ context.Context, _ *schema.EmptyInput) (*schema.AdminExploreOutput, error) {
		return &schema.AdminExploreOutput{}, nil
	})

	listMentionsOp := huma.Operation{
		OperationID: "admin-list-mentions",
		Method:      http.MethodGet,
		Path:        "/mentions",
		Summary:     "List mentions",
		Description: "Browse Webmentions received by the site with pagination and filtering support.",
		Tags:        []string{"Mentions"},
	}
	huma.Register(api, listMentionsOp, func(_ context.Context, _ *schema.MentionsBrowseInput) (*schema.AdminMentionsOutput, error) {
		return &schema.AdminMentionsOutput{}, nil
	})

	testSlackOp := huma.Operation{
		OperationID: "admin-test-slack",
		Method:      http.MethodPost,
		Path:        "/slack/test",
		Summary:     "Send test Slack notification",
		Description: "Send a test notification to the configured Slack webhook URL to verify the integration.",
		Tags:        []string{"Slack"},
	}
	huma.Register(api, testSlackOp, func(_ context.Context, _ *schema.EmptyInput) (*schema.AdminSlackTestOutput, error) {
		return &schema.AdminSlackTestOutput{}, nil
	})

	getTinybirdTokenOp := huma.Operation{
		OperationID: "admin-get-tinybird-token",
		Method:      http.MethodGet,
		Path:        "/tinybird/token",
		Summary:     "Get Tinybird token",
		Description: "Retrieve the Tinybird API token for analytics data access.",
		Tags:        []string{"Tinybird"},
	}
	huma.Register(api, getTinybirdTokenOp, func(_ context.Context, _ *schema.EmptyInput) (*schema.AdminTinybirdTokenOutput, error) {
		return &schema.AdminTinybirdTokenOutput{}, nil
	})

	getFeaturebaseTokenOp := huma.Operation{
		OperationID: "admin-get-featurebase-token",
		Method:      http.MethodGet,
		Path:        "/featurebase/token",
		Summary:     "Get Featurebase token",
		Description: "Retrieve the Featurebase JWT token for the feedback and feature request widget.",
		Tags:        []string{"Featurebase"},
	}
	huma.Register(api, getFeaturebaseTokenOp, func(_ context.Context, _ *schema.EmptyInput) (*schema.AdminFeaturebaseTokenOutput, error) {
		return &schema.AdminFeaturebaseTokenOutput{}, nil
	})

	uploadMediaOp := huma.Operation{
		OperationID: "admin-upload-media",
		Method:      http.MethodPost,
		Path:        "/media/upload",
		Summary:     "Upload media",
		Description: "Upload a media file (video, audio). Returns the URL of the uploaded file.",
		Tags:        []string{"Media"},
	}
	huma.Register(api, uploadMediaOp, func(_ context.Context, _ *schema.EmptyInput) (*schema.AdminMediaUploadOutput, error) {
		return &schema.AdminMediaUploadOutput{}, nil
	})

	uploadMediaThumbnailOp := huma.Operation{
		OperationID: "admin-upload-media-thumbnail",
		Method:      http.MethodPut,
		Path:        "/media/thumbnail/upload",
		Summary:     "Upload media thumbnail",
		Description: "Upload a thumbnail image for a previously uploaded media file.",
		Tags:        []string{"Media"},
	}
	huma.Register(api, uploadMediaThumbnailOp, func(_ context.Context, _ *schema.EmptyInput) (*schema.AdminMediaUploadOutput, error) {
		return &schema.AdminMediaUploadOutput{}, nil
	})

	uploadFileOp := huma.Operation{
		OperationID: "admin-upload-file",
		Method:      http.MethodPost,
		Path:        "/files/upload",
		Summary:     "Upload file",
		Description: "Upload a generic file attachment. Returns the URL of the uploaded file.",
		Tags:        []string{"Files"},
	}
	huma.Register(api, uploadFileOp, func(_ context.Context, _ *schema.EmptyInput) (*schema.AdminFilesUploadOutput, error) {
		return &schema.AdminFilesUploadOutput{}, nil
	})

	downloadRedirectsOp := huma.Operation{
		OperationID: "admin-download-redirects",
		Method:      http.MethodGet,
		Path:        "/redirects/download",
		Summary:     "Download redirects",
		Description: "Download the current redirects configuration as a JSON or YAML file.",
		Tags:        []string{"Redirects"},
	}
	huma.Register(api, downloadRedirectsOp, func(_ context.Context, _ *schema.EmptyInput) (*schema.AdminRoutesYAMLOutput, error) {
		return &schema.AdminRoutesYAMLOutput{}, nil
	})

	uploadRedirectsOp := huma.Operation{
		OperationID: "admin-upload-redirects",
		Method:      http.MethodPost,
		Path:        "/redirects/upload",
		Summary:     "Upload redirects",
		Description: "Upload a redirects configuration file (JSON or YAML) to override the site's URL redirects.",
		Tags:        []string{"Redirects"},
	}
	huma.Register(api, uploadRedirectsOp, func(_ context.Context, _ *schema.EmptyInput) (*schema.AdminRedirectUploadOutput, error) {
		return &schema.AdminRedirectUploadOutput{}, nil
	})

	readOembedOp := huma.Operation{
		OperationID: "admin-read-oembed",
		Method:      http.MethodGet,
		Path:        "/oembed",
		Summary:     "Fetch oEmbed response",
		Description: "Fetch oEmbed data for a given URL to generate rich embed previews in the editor.",
		Tags:        []string{"OEmbed"},
	}
	huma.Register(api, readOembedOp, func(_ context.Context, _ *schema.OEmbedReadInput) (*schema.AdminOEmbedOutput, error) {
		return &schema.AdminOEmbedOutput{}, nil
	})

	listActionsOp := huma.Operation{
		OperationID: "admin-list-actions",
		Method:      http.MethodGet,
		Path:        "/actions",
		Summary:     "List actions",
		Description: "Browse the audit log of staff actions with pagination and filtering by resource type.",
		Tags:        []string{"Actions"},
	}
	huma.Register(api, listActionsOp, func(_ context.Context, _ *schema.ActionsBrowseInput) (*schema.AdminActionsOutput, error) {
		return &schema.AdminActionsOutput{}, nil
	})

	listLinksOp := huma.Operation{
		OperationID: "admin-list-links",
		Method:      http.MethodGet,
		Path:        "/links",
		Summary:     "List links",
		Description: "Browse tracked links in email newsletters with click counts and filtering support.",
		Tags:        []string{"Links"},
	}
	huma.Register(api, listLinksOp, func(_ context.Context, _ *schema.LinksBrowseInput) (*schema.AdminLinksOutput, error) {
		return &schema.AdminLinksOutput{}, nil
	})

	bulkEditLinksOp := huma.Operation{
		OperationID: "admin-bulk-edit-links",
		Method:      http.MethodPut,
		Path:        "/links/bulk",
		Summary:     "Bulk edit links",
		Description: "Bulk update tracked links matching a filter, typically used to update redirect destinations.",
		Tags:        []string{"Links"},
	}
	huma.Register(api, bulkEditLinksOp, func(_ context.Context, _ *schema.BulkEditLinksInput) (*schema.AdminLinksOutput, error) {
		return &schema.AdminLinksOutput{}, nil
	})

	publishScheduleOp := huma.Operation{
		OperationID: "admin-publish-schedule",
		Method:      http.MethodPut,
		Path:        "/schedules/{resource}/{id}",
		Summary:     "Publish schedule",
		Description: "Publish a scheduled resource (post or page) immediately or update its scheduled time.",
		Tags:        []string{"Schedules"},
	}
	huma.Register(api, publishScheduleOp, func(_ context.Context, _ *schema.SchedulePublishInput) (*schema.AdminNoContentOutput, error) {
		return &schema.AdminNoContentOutput{}, nil
	})

	generateSlugOp := huma.Operation{
		OperationID: "admin-generate-slug",
		Method:      http.MethodGet,
		Path:        "/slugs/{type}/{name}",
		Summary:     "Generate slug",
		Description: "Generate a unique slug for a resource type from a given name, ensuring no collisions with existing slugs.",
		Tags:        []string{"Slugs"},
	}
	huma.Register(api, generateSlugOp, func(_ context.Context, _ *schema.GenerateSlugInput) (*schema.AdminSlugsOutput, error) {
		return &schema.AdminSlugsOutput{}, nil
	})

	generateSlugByIDOp := huma.Operation{
		OperationID: "admin-generate-slug-by-id",
		Method:      http.MethodGet,
		Path:        "/slugs/{type}/{name}/{id}",
		Summary:     "Generate slug with ID",
		Description: "Generate a unique slug for a resource type from a given name, excluding the specified resource ID from collision checks.",
		Tags:        []string{"Slugs"},
	}
	huma.Register(api, generateSlugByIDOp, func(_ context.Context, _ *schema.GenerateSlugByIDInput) (*schema.AdminSlugsOutput, error) {
		return &schema.AdminSlugsOutput{}, nil
	})
}
