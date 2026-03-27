package content

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/syhily/kobato/apis/content/schema"
)

// Get site settings
func addSettingsRoutes(api huma.API) {
	op := huma.Operation{
		OperationID: "content-get-settings",
		Method:      http.MethodGet,
		Path:        "/settings/",
		Summary:     "Get site settings",
		Description: "Returns global site settings. This endpoint does not accept query parameters.",
		Tags:        []string{"Settings"},
	}
	huma.Register(api, op, func(_ context.Context, _ *schema.GetSettingsInput) (*schema.GetSettingsOutput, error) {
		return &schema.GetSettingsOutput{}, nil
	})
}
