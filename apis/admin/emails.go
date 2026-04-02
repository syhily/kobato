package admin

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/syhily/kobato/apis/schema"
)

func addEmailsRoutes(api huma.API) {
	listOp := huma.Operation{
		OperationID: "admin-list-emails",
		Method:      http.MethodGet,
		Path:        "/emails",
		Summary:     "List emails",
		Tags:        []string{"Emails"},
	}
	huma.Register(api, listOp, func(_ context.Context, _ *schema.EmailsBrowseInput) (*schema.AdminEmailsOutput, error) {
		return &schema.AdminEmailsOutput{}, nil
	})

	getByIDOp := huma.Operation{
		OperationID: "admin-read-email",
		Method:      http.MethodGet,
		Path:        "/emails/{id}",
		Summary:     "Read email",
		Tags:        []string{"Emails"},
	}
	huma.Register(api, getByIDOp, func(_ context.Context, _ *schema.IDPathParam) (*schema.AdminEmailOutput, error) {
		return &schema.AdminEmailOutput{}, nil
	})

	retryOp := huma.Operation{
		OperationID: "admin-retry-email",
		Method:      http.MethodPut,
		Path:        "/emails/{id}/retry",
		Summary:     "Retry email",
		Tags:        []string{"Emails"},
	}
	huma.Register(api, retryOp, func(_ context.Context, _ *schema.IDPathParam) (*schema.AdminEmailOutput, error) {
		return &schema.AdminEmailOutput{}, nil
	})

	listBatchesOp := huma.Operation{
		OperationID: "admin-list-email-batches",
		Method:      http.MethodGet,
		Path:        "/emails/{id}/batches",
		Summary:     "List email batches",
		Tags:        []string{"Emails"},
	}
	huma.Register(api, listBatchesOp, func(_ context.Context, _ *schema.IDPathParam) (*schema.AdminEmailBatchesOutput, error) {
		return &schema.AdminEmailBatchesOutput{}, nil
	})

	listFailuresOp := huma.Operation{
		OperationID: "admin-list-email-failures",
		Method:      http.MethodGet,
		Path:        "/emails/{id}/recipient-failures",
		Summary:     "List email recipient failures",
		Tags:        []string{"Emails"},
	}
	huma.Register(api, listFailuresOp, func(_ context.Context, _ *schema.IDPathParam) (*schema.AdminEmailFailuresOutput, error) {
		return &schema.AdminEmailFailuresOutput{}, nil
	})

	readAnalyticsOp := huma.Operation{
		OperationID: "admin-read-email-analytics",
		Method:      http.MethodGet,
		Path:        "/emails/{id}/analytics",
		Summary:     "Read email analytics status",
		Tags:        []string{"Emails"},
	}
	huma.Register(api, readAnalyticsOp, func(_ context.Context, _ *schema.IDPathParam) (*schema.AdminEmailAnalyticsStatusOutput, error) {
		return &schema.AdminEmailAnalyticsStatusOutput{}, nil
	})

	scheduleAnalyticsOp := huma.Operation{
		OperationID: "admin-update-email-analytics",
		Method:      http.MethodPut,
		Path:        "/emails/{id}/analytics",
		Summary:     "Schedule email analytics",
		Tags:        []string{"Emails"},
	}
	huma.Register(api, scheduleAnalyticsOp, func(_ context.Context, _ *schema.IDPathParam) (*schema.AdminEmailAnalyticsStatusOutput, error) {
		return &schema.AdminEmailAnalyticsStatusOutput{}, nil
	})

	cancelAnalyticsOp := huma.Operation{
		OperationID: "admin-cancel-email-analytics",
		Method:      http.MethodDelete,
		Path:        "/emails/analytics",
		Summary:     "Cancel scheduled analytics",
		Tags:        []string{"Emails"},
	}
	huma.Register(api, cancelAnalyticsOp, func(_ context.Context, _ *schema.EmptyInput) (*schema.AdminEmailAnalyticsStatusOutput, error) {
		return &schema.AdminEmailAnalyticsStatusOutput{}, nil
	})

	readPreviewOp := huma.Operation{
		OperationID: "admin-read-email-preview",
		Method:      http.MethodGet,
		Path:        "/email_previews/posts/{id}",
		Summary:     "Read email preview",
		Tags:        []string{"Email Previews"},
	}
	huma.Register(api, readPreviewOp, func(_ context.Context, _ *schema.IDPathParam) (*schema.AdminNoContentOutput, error) {
		return &schema.AdminNoContentOutput{}, nil
	})

	sendPreviewOp := huma.Operation{
		OperationID: "admin-send-email-preview",
		Method:      http.MethodPost,
		Path:        "/email_previews/posts/{id}",
		Summary:     "Send test email preview",
		Tags:        []string{"Email Previews"},
	}
	huma.Register(api, sendPreviewOp, func(_ context.Context, _ *schema.IDPathParam) (*schema.AdminNoContentOutput, error) {
		return &schema.AdminNoContentOutput{}, nil
	})
}
