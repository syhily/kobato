package content

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/syhily/kobato/apis/content/schema"
)

func addPostsRoutes(api huma.API) {
	// List posts
	listOp := huma.Operation{
		OperationID: "content-list-posts",
		Method:      http.MethodGet,
		Path:        "/posts/",
		Summary:     "List posts",
		Description: "Browse posts with include/fields/filter/limit/page/order/formats parameters.",
		Tags:        []string{"Posts"},
	}
	huma.Register(api, listOp, func(_ context.Context, _ *schema.ListPostsInput) (*schema.ListPostsOutput, error) {
		// TODO Implement posts list.
		return &schema.ListPostsOutput{}, nil
	})

	// Get post by ID
	getByIDOp := huma.Operation{
		OperationID: "content-get-post-by-id",
		Method:      http.MethodGet,
		Path:        "/posts/{id}/",
		Summary:     "Get post by ID",
		Tags:        []string{"Posts"},
	}
	huma.Register(api, getByIDOp, func(_ context.Context, _ *schema.IDPathParam) (*schema.GetPostOutput, error) {
		// TODO Implement post by ID.
		return &schema.GetPostOutput{}, nil
	})

	// Get post by slug
	getBySlugOp := huma.Operation{
		OperationID: "content-get-post-by-slug",
		Method:      http.MethodGet,
		Path:        "/posts/slug/{slug}/",
		Summary:     "Get post by slug",
		Tags:        []string{"Posts"},
	}
	huma.Register(api, getBySlugOp, func(_ context.Context, _ *schema.SlugPathParam) (*schema.GetPostOutput, error) {
		// TODO Implement post by slug.s
		return &schema.GetPostOutput{}, nil
	})
}
