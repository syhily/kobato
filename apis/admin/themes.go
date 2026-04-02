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
		Description: "Browse all installed themes, including their active status and version information.",
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
		Description: "Retrieve the currently active theme and its configuration details.",
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
		Description: "Upload a theme as a ZIP file. The uploaded theme is validated and installed.",
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
		Description: "Install a theme from the Ghost marketplace by providing its repository reference.",
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
		Description: "Download an installed theme as a ZIP archive by its name.",
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
		Description: "Set an installed theme as the active theme for the site.",
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
		Description: "Permanently delete an installed theme by name. The active theme cannot be deleted.",
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
		Description: "Browse all custom settings defined by the active theme.",
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
		Description: "Update custom settings defined by the active theme. Accepts an array of setting key-value pairs.",
		Tags:        []string{"Custom Theme Settings"},
	}
	huma.Register(api, editCustomSettingsOp, func(_ context.Context, _ *schema.CustomThemeSettingsEditInput) (*schema.AdminCustomThemeSettingsOutput, error) {
		return &schema.AdminCustomThemeSettingsOutput{}, nil
	})
}
