package admin

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/syhily/kobato/apis/schema"
)

func addTagsRoutes(api huma.API) {
	listOp := huma.Operation{
		OperationID: "admin-list-tags",
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
		OperationID: "admin-get-tag-by-id",
		Method:      http.MethodGet,
		Path:        "/tags/{id}",
		Summary:     "Get tag by ID",
		Tags:        []string{"Tags"},
	}
	huma.Register(api, getByIDOp, func(_ context.Context, _ *schema.TagReadByIDInput) (*schema.TagOutput, error) {
		return &schema.TagOutput{}, nil
	})

	getBySlugOp := huma.Operation{
		OperationID: "admin-get-tag-by-slug",
		Method:      http.MethodGet,
		Path:        "/tags/slug/{slug}",
		Summary:     "Get tag by slug",
		Tags:        []string{"Tags"},
	}
	huma.Register(api, getBySlugOp, func(_ context.Context, _ *schema.TagReadBySlugInput) (*schema.TagOutput, error) {
		return &schema.TagOutput{}, nil
	})

	createOp := huma.Operation{
		OperationID:   "admin-create-tag",
		Method:        http.MethodPost,
		Path:          "/tags",
		Summary:       "Create a tag",
		Tags:          []string{"Tags"},
		DefaultStatus: http.StatusCreated,
	}
	huma.Register(api, createOp, func(_ context.Context, _ *schema.CreateTagInput) (*schema.TagOutput, error) {
		return &schema.TagOutput{}, nil
	})

	updateOp := huma.Operation{
		OperationID: "admin-update-tag",
		Method:      http.MethodPut,
		Path:        "/tags/{id}",
		Summary:     "Update a tag",
		Tags:        []string{"Tags"},
	}
	huma.Register(api, updateOp, func(_ context.Context, _ *schema.UpdateTagInput) (*schema.TagOutput, error) {
		return &schema.TagOutput{}, nil
	})

	deleteOp := huma.Operation{
		OperationID:   "admin-delete-tag",
		Method:        http.MethodDelete,
		Path:          "/tags/{id}",
		Summary:       "Delete a tag",
		Tags:          []string{"Tags"},
		DefaultStatus: http.StatusNoContent,
	}
	huma.Register(api, deleteOp, func(_ context.Context, _ *schema.IDPathParam) (*schema.AdminNoContentOutput, error) {
		return &schema.AdminNoContentOutput{}, nil
	})
}
