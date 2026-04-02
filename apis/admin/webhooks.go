package admin

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/syhily/kobato/apis/schema"
)

func addWebhooksRoutes(api huma.API) {
	createOp := huma.Operation{
		OperationID:   "admin-create-webhook",
		Method:        http.MethodPost,
		Path:          "/webhooks",
		Summary:       "Create a webhook",
		Description:   "Create a new webhook for an integration. Requires a target URL and event name. The event name must be lowercase.",
		Tags:          []string{"Webhooks"},
		DefaultStatus: http.StatusCreated,
	}
	huma.Register(api, createOp, func(_ context.Context, _ *schema.CreateWebhookInput) (*schema.WebhookOutput, error) {
		return &schema.WebhookOutput{}, nil
	})

	updateOp := huma.Operation{
		OperationID: "admin-update-webhook",
		Method:      http.MethodPut,
		Path:        "/webhooks/{id}",
		Summary:     "Update a webhook",
		Description: "Update an existing webhook by ID. Supports changing the target URL, event, and other configuration.",
		Tags:        []string{"Webhooks"},
	}
	huma.Register(api, updateOp, func(_ context.Context, _ *schema.UpdateWebhookInput) (*schema.WebhookOutput, error) {
		return &schema.WebhookOutput{}, nil
	})

	deleteOp := huma.Operation{
		OperationID:   "admin-delete-webhook",
		Method:        http.MethodDelete,
		Path:          "/webhooks/{id}",
		Summary:       "Delete a webhook",
		Description:   "Permanently delete a webhook by its ID.",
		Tags:          []string{"Webhooks"},
		DefaultStatus: http.StatusNoContent,
	}
	huma.Register(api, deleteOp, func(_ context.Context, _ *schema.IDPathParam) (*schema.AdminNoContentOutput, error) {
		return &schema.AdminNoContentOutput{}, nil
	})
}
