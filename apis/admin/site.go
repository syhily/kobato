package admin

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/syhily/kobato/apis/schema"
)

func addSiteRoutes(api huma.API) {
	op := huma.Operation{
		OperationID: "admin-get-site",
		Method:      http.MethodGet,
		Path:        "/site",
		Summary:     "Get site configuration",
		Description: "Returns basic site metadata: title, description, logo, url, and version.",
		Tags:        []string{"Site"},
	}
	huma.Register(api, op, func(_ context.Context, _ *schema.EmptyInput) (*schema.GetSiteOutput, error) {
		return &schema.GetSiteOutput{}, nil
	})
}
