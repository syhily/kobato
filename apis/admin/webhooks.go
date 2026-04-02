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
		Tags:          []string{"Webhooks"},
		DefaultStatus: http.StatusNoContent,
	}
	huma.Register(api, deleteOp, func(_ context.Context, _ *schema.IDPathParam) (*schema.AdminNoContentOutput, error) {
		return &schema.AdminNoContentOutput{}, nil
	})
}
