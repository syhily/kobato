package admin

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/syhily/kobato/apis/schema"
)

func addSettingsRoutes(api huma.API) {
	downloadRoutesYAMLOp := huma.Operation{
		OperationID: "admin-download-routes-yaml",
		Method:      http.MethodGet,
		Path:        "/settings/routes/yaml",
		Summary:     "Download routes YAML",
		Tags:        []string{"Settings"},
		Responses: map[string]*huma.Response{
			"200": {
				Description: "Routes YAML download",
				Content: map[string]*huma.MediaType{
					"text/yaml": {},
				},
			},
		},
	}
	huma.Register(api, downloadRoutesYAMLOp, func(_ context.Context, _ *schema.EmptyInput) (*schema.AdminRoutesYAMLOutput, error) {
		return &schema.AdminRoutesYAMLOutput{}, nil
	})

	uploadRoutesYAMLOp := huma.Operation{
		OperationID: "admin-upload-routes-yaml",
		Method:      http.MethodPost,
		Path:        "/settings/routes/yaml",
		Summary:     "Upload routes YAML",
		Tags:        []string{"Settings"},
	}
	huma.Register(api, uploadRoutesYAMLOp, func(_ context.Context, _ *schema.AdminRoutesYAMLUploadInput) (*schema.AdminNoContentOutput, error) {
		return &schema.AdminNoContentOutput{}, nil
	})

	browseOp := huma.Operation{
		OperationID: "admin-get-settings",
		Method:      http.MethodGet,
		Path:        "/settings",
		Summary:     "Get all settings",
		Description: "Returns all settings as a key-value array.",
		Tags:        []string{"Settings"},
	}
	huma.Register(api, browseOp, func(_ context.Context, _ *schema.AdminSettingsBrowseInput) (*schema.AdminGetSettingsOutput, error) {
		return &schema.AdminGetSettingsOutput{}, nil
	})

	editOp := huma.Operation{
		OperationID: "admin-edit-settings",
		Method:      http.MethodPut,
		Path:        "/settings",
		Summary:     "Edit settings",
		Description: "Update one or more settings by key-value pairs.",
		Tags:        []string{"Settings"},
	}
	huma.Register(api, editOp, func(_ context.Context, _ *schema.AdminEditSettingsInput) (*schema.AdminGetSettingsOutput, error) {
		return &schema.AdminGetSettingsOutput{}, nil
	})

	verifyOp := huma.Operation{
		OperationID: "admin-verify-settings-update",
		Method:      http.MethodPut,
		Path:        "/settings/verifications",
		Summary:     "Verify settings property update",
		Tags:        []string{"Settings"},
	}
	huma.Register(api, verifyOp, func(_ context.Context, _ *schema.AdminSettingsVerificationInput) (*schema.AdminGetSettingsOutput, error) {
		return &schema.AdminGetSettingsOutput{}, nil
	})

	disconnectStripeConnectOp := huma.Operation{
		OperationID:   "admin-disconnect-stripe-connect",
		Method:        http.MethodDelete,
		Path:          "/settings/stripe/connect",
		Summary:       "Disconnect Stripe Connect integration",
		Tags:          []string{"Settings"},
		DefaultStatus: http.StatusNoContent,
	}
	huma.Register(api, disconnectStripeConnectOp, func(_ context.Context, _ *schema.EmptyInput) (*schema.AdminNoContentOutput, error) {
		return &schema.AdminNoContentOutput{}, nil
	})
}
