package admin

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/syhily/kobato/apis/schema"
)

func addPagesRoutes(api huma.API) {
	listOp := huma.Operation{
		OperationID: "admin-list-pages",
		Method:      http.MethodGet,
		Path:        "/pages",
		Summary:     "List pages",
		Description: "Browse pages with include/fields/filter/limit/page/order/formats parameters.",
		Tags:        []string{"Pages"},
	}
	huma.Register(api, listOp, func(_ context.Context, _ *schema.AdminPagesBrowseInput) (*schema.AdminListPagesOutput, error) {
		return &schema.AdminListPagesOutput{}, nil
	})

	bulkDeleteOp := huma.Operation{
		OperationID: "admin-bulk-delete-pages",
		Method:      http.MethodDelete,
		Path:        "/pages",
		Summary:     "Bulk delete pages",
		Tags:        []string{"Pages"},
	}
	huma.Register(api, bulkDeleteOp, func(_ context.Context, _ *schema.AdminPageBulkDeleteInput) (*schema.AdminBulkActionOutput, error) {
		return &schema.AdminBulkActionOutput{}, nil
	})

	bulkEditOp := huma.Operation{
		OperationID: "admin-bulk-edit-pages",
		Method:      http.MethodPut,
		Path:        "/pages/bulk",
		Summary:     "Bulk edit pages",
		Tags:        []string{"Pages"},
	}
	huma.Register(api, bulkEditOp, func(_ context.Context, _ *schema.AdminPageBulkEditInput) (*schema.AdminBulkActionOutput, error) {
		return &schema.AdminBulkActionOutput{}, nil
	})

	getByIDOp := huma.Operation{
		OperationID: "admin-get-page-by-id",
		Method:      http.MethodGet,
		Path:        "/pages/{id}",
		Summary:     "Get page by ID",
		Tags:        []string{"Pages"},
	}
	huma.Register(api, getByIDOp, func(_ context.Context, _ *schema.AdminPageReadByIDInput) (*schema.AdminPageOutput, error) {
		return &schema.AdminPageOutput{}, nil
	})

	getBySlugOp := huma.Operation{
		OperationID: "admin-get-page-by-slug",
		Method:      http.MethodGet,
		Path:        "/pages/slug/{slug}",
		Summary:     "Get page by slug",
		Tags:        []string{"Pages"},
	}
	huma.Register(api, getBySlugOp, func(_ context.Context, _ *schema.AdminPageReadBySlugInput) (*schema.AdminPageOutput, error) {
		return &schema.AdminPageOutput{}, nil
	})

	createOp := huma.Operation{
		OperationID:   "admin-create-page",
		Method:        http.MethodPost,
		Path:          "/pages",
		Summary:       "Create a page",
		Tags:          []string{"Pages"},
		DefaultStatus: http.StatusCreated,
	}
	huma.Register(api, createOp, func(_ context.Context, _ *schema.CreatePageInput) (*schema.AdminPageOutput, error) {
		return &schema.AdminPageOutput{}, nil
	})

	updateOp := huma.Operation{
		OperationID: "admin-update-page",
		Method:      http.MethodPut,
		Path:        "/pages/{id}",
		Summary:     "Update a page",
		Tags:        []string{"Pages"},
	}
	huma.Register(api, updateOp, func(_ context.Context, _ *schema.UpdatePageInput) (*schema.AdminPageOutput, error) {
		return &schema.AdminPageOutput{}, nil
	})

	copyOp := huma.Operation{
		OperationID:   "admin-copy-page",
		Method:        http.MethodPost,
		Path:          "/pages/{id}/copy",
		Summary:       "Copy a page",
		Tags:          []string{"Pages"},
		DefaultStatus: http.StatusCreated,
	}
	huma.Register(api, copyOp, func(_ context.Context, _ *schema.CopyPageInput) (*schema.AdminPageOutput, error) {
		return &schema.AdminPageOutput{}, nil
	})

	deleteOp := huma.Operation{
		OperationID:   "admin-delete-page",
		Method:        http.MethodDelete,
		Path:          "/pages/{id}",
		Summary:       "Delete a page",
		Tags:          []string{"Pages"},
		DefaultStatus: http.StatusNoContent,
	}
	huma.Register(api, deleteOp, func(_ context.Context, _ *schema.DeletePageInput) (*schema.AdminNoContentOutput, error) {
		return &schema.AdminNoContentOutput{}, nil
	})
}
