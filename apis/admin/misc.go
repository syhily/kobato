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
		Tags:        []string{"Slugs"},
	}
	huma.Register(api, generateSlugByIDOp, func(_ context.Context, _ *schema.GenerateSlugByIDInput) (*schema.AdminSlugsOutput, error) {
		return &schema.AdminSlugsOutput{}, nil
	})
}
