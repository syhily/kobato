package content

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/syhily/kobato/apis/schema"
)

func addPagesRoutes(api huma.API) {
	listOp := huma.Operation{
		OperationID: "content-list-pages",
		Method:      http.MethodGet,
		Path:        "/pages",
		Summary:     "List pages",
		Description: "Browse pages with include/fields/filter/limit/page/order/formats parameters.",
		Tags:        []string{"Pages"},
	}
	huma.Register(api, listOp, func(_ context.Context, _ *schema.ContentPagesBrowseInput) (*schema.ListPagesOutput, error) {
		return &schema.ListPagesOutput{}, nil
	})

	getByIDOp := huma.Operation{
		OperationID: "content-get-page-by-id",
		Method:      http.MethodGet,
		Path:        "/pages/{id}",
		Summary:     "Get page by ID",
		Description: "Retrieve a single published page by its ID. Supports include, fields, and formats query parameters.",
		Tags:        []string{"Pages"},
	}
	huma.Register(api, getByIDOp, func(_ context.Context, _ *schema.ContentPageReadByIDInput) (*schema.PageOutput, error) {
		return &schema.PageOutput{}, nil
	})

	getBySlugOp := huma.Operation{
		OperationID: "content-get-page-by-slug",
		Method:      http.MethodGet,
		Path:        "/pages/slug/{slug}",
		Summary:     "Get page by slug",
		Description: "Retrieve a single published page by its slug. Supports include, fields, and formats query parameters.",
		Tags:        []string{"Pages"},
	}
	huma.Register(api, getBySlugOp, func(_ context.Context, _ *schema.ContentPageReadBySlugInput) (*schema.PageOutput, error) {
		return &schema.PageOutput{}, nil
	})
}
