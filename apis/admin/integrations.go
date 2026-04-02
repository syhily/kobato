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
		Tags:        []string{"Integrations"},
	}
	huma.Register(api, refreshKeyOp, func(_ context.Context, _ *schema.IntegrationRefreshKeyInput) (*schema.AdminIntegrationOutput, error) {
		return &schema.AdminIntegrationOutput{}, nil
	})
}
