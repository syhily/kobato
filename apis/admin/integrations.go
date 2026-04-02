package admin

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/syhily/kobato/apis/schema"
)

func addIntegrationsRoutes(api huma.API) {
	listOp := huma.Operation{
		OperationID: "admin-list-integrations",
		Method:      http.MethodGet,
		Path:        "/integrations",
		Summary:     "List integrations",
		Description: "Browse all custom integrations. Each integration provides API keys and webhook endpoints.",
		Tags:        []string{"Integrations"},
	}
	huma.Register(api, listOp, func(_ context.Context, _ *schema.IntegrationsBrowseInput) (*schema.AdminIntegrationsOutput, error) {
		return &schema.AdminIntegrationsOutput{}, nil
	})

	createOp := huma.Operation{
		OperationID: "admin-create-integration",
		Method:      http.MethodPost,
		Path:        "/integrations",
		Summary:     "Create integration",
		Description: "Create a new custom integration. Automatically generates Content and Admin API keys.",
		Tags:        []string{"Integrations"},
	}
	huma.Register(api, createOp, func(_ context.Context, _ *schema.CreateIntegrationInput) (*schema.AdminIntegrationOutput, error) {
		return &schema.AdminIntegrationOutput{}, nil
	})

	getByIDOp := huma.Operation{
		OperationID: "admin-read-integration",
		Method:      http.MethodGet,
		Path:        "/integrations/{id}",
		Summary:     "Read integration",
		Description: "Retrieve a single integration by its ID, including its API keys and associated webhooks.",
		Tags:        []string{"Integrations"},
	}
	huma.Register(api, getByIDOp, func(_ context.Context, _ *schema.IntegrationReadInput) (*schema.AdminIntegrationOutput, error) {
		return &schema.AdminIntegrationOutput{}, nil
	})

	updateOp := huma.Operation{
		OperationID: "admin-update-integration",
		Method:      http.MethodPut,
		Path:        "/integrations/{id}",
		Summary:     "Update integration",
		Description: "Update an existing integration by ID. Supports changing the name, description, icon, and associated webhooks.",
		Tags:        []string{"Integrations"},
	}
	huma.Register(api, updateOp, func(_ context.Context, _ *schema.UpdateIntegrationInput) (*schema.AdminIntegrationOutput, error) {
		return &schema.AdminIntegrationOutput{}, nil
	})

	deleteOp := huma.Operation{
		OperationID: "admin-delete-integration",
		Method:      http.MethodDelete,
		Path:        "/integrations/{id}",
		Summary:     "Delete integration",
		Description: "Permanently delete a custom integration and revoke its API keys and webhooks.",
		Tags:        []string{"Integrations"},
	}
	huma.Register(api, deleteOp, func(_ context.Context, _ *schema.IDPathParam) (*schema.AdminNoContentOutput, error) {
		return &schema.AdminNoContentOutput{}, nil
	})

	refreshKeyOp := huma.Operation{
		OperationID: "admin-refresh-integration-key",
		Method:      http.MethodPost,
		Path:        "/integrations/{id}/api_key/{keyid}/refresh",
		Summary:     "Refresh integration API key",
		Description: "Regenerate an API key for an integration. The previous key is immediately invalidated.",
		Tags:        []string{"Integrations"},
	}
	huma.Register(api, refreshKeyOp, func(_ context.Context, _ *schema.IntegrationRefreshKeyInput) (*schema.AdminIntegrationOutput, error) {
		return &schema.AdminIntegrationOutput{}, nil
	})
}
