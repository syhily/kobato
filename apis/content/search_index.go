package content

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/syhily/kobato/apis/schema"
)

func addSearchIndexRoutes(api huma.API) {
	postsOp := huma.Operation{
		OperationID: "content-search-index-posts",
		Method:      http.MethodGet,
		Path:        "/search-index/posts",
		Summary:     "Get content search index posts",
		Tags:        []string{"Search Index"},
	}
	huma.Register(api, postsOp, func(_ context.Context, _ *schema.EmptyInput) (*schema.ContentSearchIndexPostsOutput, error) {
		return &schema.ContentSearchIndexPostsOutput{}, nil
	})

	authorsOp := huma.Operation{
		OperationID: "content-search-index-authors",
		Method:      http.MethodGet,
		Path:        "/search-index/authors",
		Summary:     "Get content search index authors",
		Tags:        []string{"Search Index"},
	}
	huma.Register(api, authorsOp, func(_ context.Context, _ *schema.EmptyInput) (*schema.ContentSearchIndexAuthorsOutput, error) {
		return &schema.ContentSearchIndexAuthorsOutput{}, nil
	})

	tagsOp := huma.Operation{
		OperationID: "content-search-index-tags",
		Method:      http.MethodGet,
		Path:        "/search-index/tags",
		Summary:     "Get content search index tags",
		Tags:        []string{"Search Index"},
	}
	huma.Register(api, tagsOp, func(_ context.Context, _ *schema.EmptyInput) (*schema.ContentSearchIndexTagsOutput, error) {
		return &schema.ContentSearchIndexTagsOutput{}, nil
	})
}
