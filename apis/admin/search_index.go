package admin

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/syhily/kobato/apis/schema"
)

func addSearchIndexRoutes(api huma.API) {
	tag := "Search Index"

	huma.Register(api, huma.Operation{
		OperationID: "admin-search-index-posts",
		Method:      http.MethodGet,
		Path:        "/search-index/posts",
		Summary:     "Get search index posts",
		Tags:        []string{tag},
	}, func(_ context.Context, _ *schema.EmptyInput) (*schema.AdminSearchIndexPostsOutput, error) {
		return &schema.AdminSearchIndexPostsOutput{}, nil
	})

	huma.Register(api, huma.Operation{
		OperationID: "admin-search-index-pages",
		Method:      http.MethodGet,
		Path:        "/search-index/pages",
		Summary:     "Get search index pages",
		Tags:        []string{tag},
	}, func(_ context.Context, _ *schema.EmptyInput) (*schema.AdminSearchIndexPagesOutput, error) {
		return &schema.AdminSearchIndexPagesOutput{}, nil
	})

	huma.Register(api, huma.Operation{
		OperationID: "admin-search-index-tags",
		Method:      http.MethodGet,
		Path:        "/search-index/tags",
		Summary:     "Get search index tags",
		Tags:        []string{tag},
	}, func(_ context.Context, _ *schema.EmptyInput) (*schema.AdminSearchIndexTagsOutput, error) {
		return &schema.AdminSearchIndexTagsOutput{}, nil
	})

	huma.Register(api, huma.Operation{
		OperationID: "admin-search-index-users",
		Method:      http.MethodGet,
		Path:        "/search-index/users",
		Summary:     "Get search index users",
		Tags:        []string{tag},
	}, func(_ context.Context, _ *schema.EmptyInput) (*schema.AdminSearchIndexUsersOutput, error) {
		return &schema.AdminSearchIndexUsersOutput{}, nil
	})
}
