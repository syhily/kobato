package admin

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/syhily/kobato/apis/schema"
)

func addThemesRoutes(api huma.API) {
	listOp := huma.Operation{
		OperationID: "admin-list-themes",
		Method:      http.MethodGet,
		Path:        "/themes",
		Summary:     "List themes",
		Tags:        []string{"Themes"},
	}
	huma.Register(api, listOp, func(_ context.Context, _ *schema.EmptyInput) (*schema.AdminThemesOutput, error) {
		return &schema.AdminThemesOutput{}, nil
	})

	getActiveOp := huma.Operation{
		OperationID: "admin-get-active-theme",
		Method:      http.MethodGet,
		Path:        "/themes/active",
		Summary:     "Get active theme",
		Tags:        []string{"Themes"},
	}
	huma.Register(api, getActiveOp, func(_ context.Context, _ *schema.EmptyInput) (*schema.AdminThemesOutput, error) {
		return &schema.AdminThemesOutput{}, nil
	})

	uploadOp := huma.Operation{
		OperationID: "admin-upload-theme",
		Method:      http.MethodPost,
		Path:        "/themes/upload",
		Summary:     "Upload theme",
		Tags:        []string{"Themes"},
	}
	huma.Register(api, uploadOp, func(_ context.Context, _ *schema.EmptyInput) (*schema.AdminThemesOutput, error) {
		return &schema.AdminThemesOutput{}, nil
	})

	installOp := huma.Operation{
		OperationID: "admin-install-theme",
		Method:      http.MethodPost,
		Path:        "/themes/install",
		Summary:     "Install theme",
		Tags:        []string{"Themes"},
	}
	huma.Register(api, installOp, func(_ context.Context, _ *schema.ThemeInstallInput) (*schema.AdminThemesOutput, error) {
		return &schema.AdminThemesOutput{}, nil
	})

	downloadOp := huma.Operation{
		OperationID: "admin-download-theme",
		Method:      http.MethodGet,
		Path:        "/themes/{name}/download",
		Summary:     "Download theme",
		Tags:        []string{"Themes"},
	}
	huma.Register(api, downloadOp, func(_ context.Context, _ *schema.NamePathParam) (*schema.AdminRoutesYAMLOutput, error) {
		return &schema.AdminRoutesYAMLOutput{}, nil
	})

	activateOp := huma.Operation{
		OperationID: "admin-activate-theme",
		Method:      http.MethodPut,
		Path:        "/themes/{name}/activate",
		Summary:     "Activate theme",
		Tags:        []string{"Themes"},
	}
	huma.Register(api, activateOp, func(_ context.Context, _ *schema.ThemeActivateInput) (*schema.AdminThemesOutput, error) {
		return &schema.AdminThemesOutput{}, nil
	})

	deleteOp := huma.Operation{
		OperationID: "admin-delete-theme",
		Method:      http.MethodDelete,
		Path:        "/themes/{name}",
		Summary:     "Delete theme",
		Tags:        []string{"Themes"},
	}
	huma.Register(api, deleteOp, func(_ context.Context, _ *schema.NamePathParam) (*schema.AdminNoContentOutput, error) {
		return &schema.AdminNoContentOutput{}, nil
	})

	listCustomSettingsOp := huma.Operation{
		OperationID: "admin-list-custom-theme-settings",
		Method:      http.MethodGet,
		Path:        "/custom_theme_settings",
		Summary:     "List custom theme settings",
		Tags:        []string{"Custom Theme Settings"},
	}
	huma.Register(api, listCustomSettingsOp, func(_ context.Context, _ *schema.EmptyInput) (*schema.AdminCustomThemeSettingsOutput, error) {
		return &schema.AdminCustomThemeSettingsOutput{}, nil
	})

	editCustomSettingsOp := huma.Operation{
		OperationID: "admin-edit-custom-theme-settings",
		Method:      http.MethodPut,
		Path:        "/custom_theme_settings",
		Summary:     "Edit custom theme settings",
		Tags:        []string{"Custom Theme Settings"},
	}
	huma.Register(api, editCustomSettingsOp, func(_ context.Context, _ *schema.CustomThemeSettingsEditInput) (*schema.AdminCustomThemeSettingsOutput, error) {
		return &schema.AdminCustomThemeSettingsOutput{}, nil
	})
}
