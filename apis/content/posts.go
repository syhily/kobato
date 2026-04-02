package content

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/syhily/kobato/apis/schema"
)

func addPostsRoutes(api huma.API) {
	listOp := huma.Operation{
		OperationID: "content-list-posts",
		Method:      http.MethodGet,
		Path:        "/posts",
		Summary:     "List posts",
		Description: "Browse posts with include/fields/filter/limit/page/order/formats parameters.",
		Tags:        []string{"Posts"},
	}
	huma.Register(api, listOp, func(_ context.Context, _ *schema.ContentPostsBrowseInput) (*schema.ListPostsOutput, error) {
		return &schema.ListPostsOutput{}, nil
	})

	getByIDOp := huma.Operation{
		OperationID: "content-get-post-by-id",
		Method:      http.MethodGet,
		Path:        "/posts/{id}",
		Summary:     "Get post by ID",
		Tags:        []string{"Posts"},
	}
	huma.Register(api, getByIDOp, func(_ context.Context, _ *schema.ContentPostReadByIDInput) (*schema.PostOutput, error) {
		return &schema.PostOutput{}, nil
	})

	getBySlugOp := huma.Operation{
		OperationID: "content-get-post-by-slug",
		Method:      http.MethodGet,
		Path:        "/posts/slug/{slug}",
		Summary:     "Get post by slug",
		Tags:        []string{"Posts"},
	}
	huma.Register(api, getBySlugOp, func(_ context.Context, _ *schema.ContentPostReadBySlugInput) (*schema.PostOutput, error) {
		return &schema.PostOutput{}, nil
	})
}
