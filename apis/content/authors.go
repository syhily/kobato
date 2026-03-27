package content

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/syhily/kobato/apis/content/schema"
)

func addAuthorsRoutes(api huma.API) {
	// List authors
	listOp := huma.Operation{
		OperationID: "content-list-authors",
		Method:      http.MethodGet,
		Path:        "/authors/",
		Summary:     "List authors",
		Description: "Browse authors with include/fields/filter/limit/page/order parameters.",
		Tags:        []string{"Authors"},
	}
	huma.Register(api, listOp, func(_ context.Context, _ *schema.ListAuthorsInput) (*schema.ListAuthorsOutput, error) {
		// TODO Implement authors list.
		return &schema.ListAuthorsOutput{}, nil
	})

	// Get author by ID
	getByIDOp := huma.Operation{
		OperationID: "content-get-author-by-id",
		Method:      http.MethodGet,
		Path:        "/authors/{id}/",
		Summary:     "Get author by ID",
		Tags:        []string{"Authors"},
	}
	huma.Register(api, getByIDOp, func(_ context.Context, _ *schema.IDPathParam) (*schema.GetAuthorOutput, error) {
		// TODO Implement author by ID.
		return &schema.GetAuthorOutput{}, nil
	})

	// Get author by slug
	getBySlugOp := huma.Operation{
		OperationID: "content-get-author-by-slug",
		Method:      http.MethodGet,
		Path:        "/authors/slug/{slug}/",
		Summary:     "Get author by slug",
		Tags:        []string{"Authors"},
	}
	huma.Register(api, getBySlugOp, func(_ context.Context, _ *schema.SlugPathParam) (*schema.GetAuthorOutput, error) {
		// TODO Implement author by slug.
		return &schema.GetAuthorOutput{}, nil
	})
}
