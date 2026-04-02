package content

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/syhily/kobato/apis/schema"
)

func addRecommendationsRoutes(api huma.API) {
	op := huma.Operation{
		OperationID: "content-list-recommendations",
		Method:      http.MethodGet,
		Path:        "/recommendations",
		Summary:     "List recommendations",
		Description: "Browse public site recommendations with pagination support.",
		Tags:        []string{"Recommendations"},
	}
	huma.Register(api, op, func(_ context.Context, _ *schema.ContentRecommendationsBrowseInput) (*schema.ContentRecommendationsOutput, error) {
		return &schema.ContentRecommendationsOutput{}, nil
	})
}
