package content

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/syhily/kobato/apis/content/schema"
)

func addPagesRoutes(api huma.API) {
	listOp := huma.Operation{
		OperationID: "content-list-pages",
		Method:      http.MethodGet,
		Path:        "/pages/",
		Summary:     "List pages",
		Description: "Browse pages with include/fields/filter/limit/page/order/formats parameters.",
		Tags:        []string{"Pages"},
	}
	huma.Register(api, listOp, func(_ context.Context, _ *schema.ListPagesInput) (*schema.ListPagesOutput, error) {
		// TODO Implement pages list.
		output := &schema.ListPagesOutput{
			Pages: []schema.PageResource{
				{
					ID:   "1",
					Slug: "test",
				},
			},
		}
		return output, nil
	})

	// Get page by ID
	getByIDOp := huma.Operation{
		OperationID: "content-get-page-by-id",
		Method:      http.MethodGet,
		Path:        "/pages/{id}/",
		Summary:     "Get page by ID",
		Tags:        []string{"Pages"},
	}
	huma.Register(api, getByIDOp, func(_ context.Context, _ *schema.IDPathParam) (*schema.GetPageOutput, error) {
		// TODO Implement page by ID.
		output := &schema.GetPageOutput{
			Pages: []schema.PageResource{
				{
					ID:   "1",
					Slug: "test",
				},
			},
		}
		return output, nil
	})

	// Get page by slug
	getBySlugOp := huma.Operation{
		OperationID: "content-get-page-by-slug",
		Method:      http.MethodGet,
		Path:        "/pages/slug/{slug}/",
		Summary:     "Get page by slug",
		Tags:        []string{"Pages"},
	}
	huma.Register(api, getBySlugOp, func(_ context.Context, _ *schema.SlugPathParam) (*schema.GetPageOutput, error) {
		// TODO Implement page by slug.
		output := &schema.GetPageOutput{
			Pages: []schema.PageResource{
				{
					ID:   "1",
					Slug: "test",
				},
			},
		}
		return output, nil
	})
}
