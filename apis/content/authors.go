package content

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/syhily/kobato/apis/schema"
)

func addAuthorsRoutes(api huma.API) {
	listOp := huma.Operation{
		OperationID: "content-list-authors",
		Method:      http.MethodGet,
		Path:        "/authors",
		Summary:     "List authors",
		Description: "Browse authors with include/fields/filter/limit/page/order parameters.",
		Tags:        []string{"Authors"},
	}
	huma.Register(api, listOp, func(_ context.Context, _ *schema.AuthorsBrowseInput) (*schema.ListAuthorsOutput, error) {
		return &schema.ListAuthorsOutput{}, nil
	})

	getByIDOp := huma.Operation{
		OperationID: "content-get-author-by-id",
		Method:      http.MethodGet,
		Path:        "/authors/{id}",
		Summary:     "Get author by ID",
		Description: "Retrieve a single author by their ID. Supports include and fields query parameters.",
		Tags:        []string{"Authors"},
	}
	huma.Register(api, getByIDOp, func(_ context.Context, _ *schema.AuthorReadByIDInput) (*schema.AuthorOutput, error) {
		return &schema.AuthorOutput{}, nil
	})

	getBySlugOp := huma.Operation{
		OperationID: "content-get-author-by-slug",
		Method:      http.MethodGet,
		Path:        "/authors/slug/{slug}",
		Summary:     "Get author by slug",
		Description: "Retrieve a single author by their slug. Supports include and fields query parameters.",
		Tags:        []string{"Authors"},
	}
	huma.Register(api, getBySlugOp, func(_ context.Context, _ *schema.AuthorReadBySlugInput) (*schema.AuthorOutput, error) {
		return &schema.AuthorOutput{}, nil
	})
}
