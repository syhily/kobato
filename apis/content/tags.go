package content

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/syhily/kobato/apis/schema"
)

func addTagsRoutes(api huma.API) {
	listOp := huma.Operation{
		OperationID: "content-list-tags",
		Method:      http.MethodGet,
		Path:        "/tags",
		Summary:     "List tags",
		Description: "Browse tags with include/fields/filter/limit/page/order parameters.",
		Tags:        []string{"Tags"},
	}
	huma.Register(api, listOp, func(_ context.Context, _ *schema.TagsBrowseInput) (*schema.ListTagsOutput, error) {
		return &schema.ListTagsOutput{}, nil
	})

	getByIDOp := huma.Operation{
		OperationID: "content-get-tag-by-id",
		Method:      http.MethodGet,
		Path:        "/tags/{id}",
		Summary:     "Get tag by ID",
		Description: "Retrieve a single public tag by its ID. Supports include and fields query parameters.",
		Tags:        []string{"Tags"},
	}
	huma.Register(api, getByIDOp, func(_ context.Context, _ *schema.TagReadByIDInput) (*schema.TagOutput, error) {
		return &schema.TagOutput{}, nil
	})

	getBySlugOp := huma.Operation{
		OperationID: "content-get-tag-by-slug",
		Method:      http.MethodGet,
		Path:        "/tags/slug/{slug}",
		Summary:     "Get tag by slug",
		Description: "Retrieve a single public tag by its slug. Supports include and fields query parameters.",
		Tags:        []string{"Tags"},
	}
	huma.Register(api, getBySlugOp, func(_ context.Context, _ *schema.TagReadBySlugInput) (*schema.TagOutput, error) {
		return &schema.TagOutput{}, nil
	})
}
