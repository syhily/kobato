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
		Description: "Browse member labels with filter, pagination, and ordering support.",
		Tags:        []string{"Labels"},
	}
	huma.Register(api, listOp, func(_ context.Context, _ *schema.LabelsBrowseInput) (*schema.AdminLabelsOutput, error) {
		return &schema.AdminLabelsOutput{}, nil
	})

	createOp := huma.Operation{
		OperationID: "admin-create-label",
		Method:      http.MethodPost,
		Path:        "/labels",
		Summary:     "Create label",
		Description: "Create a new member label. The name field is required. Labels are used to categorize and filter members.",
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
		Description: "Retrieve a single label by its ID.",
		Tags:        []string{"Labels"},
	}
	huma.Register(api, getByIDOp, func(_ context.Context, _ *schema.LabelReadByIDInput) (*schema.AdminLabelOutput, error) {
		return &schema.AdminLabelOutput{}, nil
	})

	getBySlugOp := huma.Operation{
		OperationID: "admin-read-label-by-slug",
		Method:      http.MethodGet,
		Path:        "/labels/slug/{slug}",
		Summary:     "Read label by slug",
		Description: "Retrieve a single label by its slug.",
		Tags:        []string{"Labels"},
	}
	huma.Register(api, getBySlugOp, func(_ context.Context, _ *schema.LabelReadBySlugInput) (*schema.AdminLabelOutput, error) {
		return &schema.AdminLabelOutput{}, nil
	})

	updateOp := huma.Operation{
		OperationID: "admin-update-label",
		Method:      http.MethodPut,
		Path:        "/labels/{id}",
		Summary:     "Update label",
		Description: "Update an existing label by ID. The updated_at field is required for optimistic locking.",
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
		Description: "Permanently delete a label by its ID. Members with this label will have it removed.",
		Tags:        []string{"Labels"},
	}
	huma.Register(api, deleteOp, func(_ context.Context, _ *schema.IDPathParam) (*schema.AdminNoContentOutput, error) {
		return &schema.AdminNoContentOutput{}, nil
	})
}
