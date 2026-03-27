package content

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/syhily/kobato/apis/content/schema"
)

func addTagsRoutes(api huma.API) {
	// List tags
	listOp := huma.Operation{
		OperationID: "content-list-tags",
		Method:      http.MethodGet,
		Path:        "/tags/",
		Summary:     "List tags",
		Description: "Browse tags with include/fields/filter/limit/page/order parameters.",
		Tags:        []string{"Tags"},
	}
	huma.Register(api, listOp, func(_ context.Context, _ *schema.ListTagsInput) (*schema.ListTagsOutput, error) {
		// TODO Implement tags list.
		output := &schema.ListTagsOutput{
			Tags: []schema.TagResource{
				{
					ID:   "1",
					Slug: "test",
				},
			},
		}
		return output, nil
	})

	// Get tag by ID
	getByIDOp := huma.Operation{
		OperationID: "content-get-tag-by-id",
		Method:      http.MethodGet,
		Path:        "/tags/{id}/",
		Summary:     "Get tag by ID",
		Tags:        []string{"Tags"},
	}
	huma.Register(api, getByIDOp, func(_ context.Context, _ *schema.IDPathParam) (*schema.GetTagOutput, error) {
		// TODO Implement tag by ID.
		output := &schema.GetTagOutput{
			Tags: []schema.TagResource{
				{
					ID:   "1",
					Slug: "test",
				},
			},
		}
		return output, nil
	})

	// Get tag by slug
	getBySlugOp := huma.Operation{
		OperationID: "content-get-tag-by-slug",
		Method:      http.MethodGet,
		Path:        "/tags/slug/{slug}/",
		Summary:     "Get tag by slug",
		Tags:        []string{"Tags"},
	}
	huma.Register(api, getBySlugOp, func(_ context.Context, _ *schema.SlugPathParam) (*schema.GetTagOutput, error) {
		// TODO Implement tag by slug.
		output := &schema.GetTagOutput{
			Tags: []schema.TagResource{
				{
					ID:   "1",
					Slug: "test",
				},
			},
		}
		return output, nil
	})
}
