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
		Description: "Browse sent emails with filter, pagination, and ordering support.",
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
		Description: "Retrieve a single email by its ID, including delivery statistics and content.",
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
		Description: "Retry sending a failed email. Only emails with a failed status can be retried.",
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
		Description: "Browse batches for a specific email, showing delivery status and recipient counts per batch.",
		Tags:        []string{"Emails"},
	}
	huma.Register(api, listBatchesOp, func(_ context.Context, _ *schema.EmailBatchesBrowseInput) (*schema.AdminEmailBatchesOutput, error) {
		return &schema.AdminEmailBatchesOutput{}, nil
	})

	listFailuresOp := huma.Operation{
		OperationID: "admin-list-email-failures",
		Method:      http.MethodGet,
		Path:        "/emails/{id}/recipient-failures",
		Summary:     "List email recipient failures",
		Description: "Browse delivery failures for a specific email, including error codes, messages, and affected member details.",
		Tags:        []string{"Emails"},
	}
	huma.Register(api, listFailuresOp, func(_ context.Context, _ *schema.EmailFailuresBrowseInput) (*schema.AdminEmailFailuresOutput, error) {
		return &schema.AdminEmailFailuresOutput{}, nil
	})

	readAnalyticsOp := huma.Operation{
		OperationID: "admin-read-email-analytics",
		Method:      http.MethodGet,
		Path:        "/emails/{id}/analytics",
		Summary:     "Read email analytics status",
		Description: "Get the current analytics collection status for a specific email.",
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
		Description: "Schedule analytics collection for a specific email to re-fetch open and click data.",
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
		Description: "Cancel all scheduled email analytics collection jobs.",
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
		Description: "Generate and return an email preview for a specific post, including the rendered HTML and plaintext versions.",
		Tags:        []string{"Email Previews"},
	}
	huma.Register(api, readPreviewOp, func(_ context.Context, _ *schema.IDPathParam) (*schema.AdminEmailPreviewOutput, error) {
		return &schema.AdminEmailPreviewOutput{}, nil
	})

	sendPreviewOp := huma.Operation{
		OperationID: "admin-send-email-preview",
		Method:      http.MethodPost,
		Path:        "/email_previews/posts/{id}",
		Summary:     "Send test email preview",
		Description: "Send a test email preview for a specific post to the provided email addresses using the specified newsletter.",
		Tags:        []string{"Email Previews"},
	}
	huma.Register(api, sendPreviewOp, func(_ context.Context, _ *schema.SendTestEmailPreviewInput) (*schema.AdminNoContentOutput, error) {
		return &schema.AdminNoContentOutput{}, nil
	})
}
