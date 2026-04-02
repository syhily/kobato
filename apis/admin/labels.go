package admin

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/syhily/kobato/apis/schema"
)

func addLabelsRoutes(api huma.API) {
	listOp := huma.Operation{
		OperationID: "admin-list-labels",
		Method:      http.MethodGet,
		Path:        "/labels",
		Summary:     "List labels",
		Tags:        []string{"Labels"},
	}
	huma.Register(api, listOp, func(_ context.Context, _ *schema.CommonBrowseQueryParams) (*schema.AdminLabelsOutput, error) {
		return &schema.AdminLabelsOutput{}, nil
	})

	createOp := huma.Operation{
		OperationID: "admin-create-label",
		Method:      http.MethodPost,
		Path:        "/labels",
		Summary:     "Create label",
		Tags:        []string{"Labels"},
	}
	huma.Register(api, createOp, func(_ context.Context, _ *schema.CreateLabelInput) (*schema.AdminLabelOutput, error) {
		return &schema.AdminLabelOutput{}, nil
	})

	getByIDOp := huma.Operation{
		OperationID: "admin-read-label",
		Method:      http.MethodGet,
		Path:        "/labels/{id}",
		Summary:     "Read label",
		Tags:        []string{"Labels"},
	}
	huma.Register(api, getByIDOp, func(_ context.Context, _ *schema.IDPathParam) (*schema.AdminLabelOutput, error) {
		return &schema.AdminLabelOutput{}, nil
	})

	getBySlugOp := huma.Operation{
		OperationID: "admin-read-label-by-slug",
		Method:      http.MethodGet,
		Path:        "/labels/slug/{slug}",
		Summary:     "Read label by slug",
		Tags:        []string{"Labels"},
	}
	huma.Register(api, getBySlugOp, func(_ context.Context, _ *schema.SlugPathParam) (*schema.AdminLabelOutput, error) {
		return &schema.AdminLabelOutput{}, nil
	})

	updateOp := huma.Operation{
		OperationID: "admin-update-label",
		Method:      http.MethodPut,
		Path:        "/labels/{id}",
		Summary:     "Update label",
		Tags:        []string{"Labels"},
	}
	huma.Register(api, updateOp, func(_ context.Context, _ *schema.UpdateLabelInput) (*schema.AdminLabelOutput, error) {
		return &schema.AdminLabelOutput{}, nil
	})

	deleteOp := huma.Operation{
		OperationID: "admin-delete-label",
		Method:      http.MethodDelete,
		Path:        "/labels/{id}",
		Summary:     "Delete label",
		Tags:        []string{"Labels"},
	}
	huma.Register(api, deleteOp, func(_ context.Context, _ *schema.IDPathParam) (*schema.AdminNoContentOutput, error) {
		return &schema.AdminNoContentOutput{}, nil
	})
}
