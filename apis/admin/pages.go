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
		Description: "Permanently delete multiple pages matching the given filter.",
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
		Description: "Apply a bulk action to multiple pages matching the given filter. Supported actions include adding/removing tags and changing access level.",
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
		Description: "Retrieve a single page by its ID. Supports include, fields, and formats query parameters.",
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
		Description: "Retrieve a single page by its slug. Supports include, fields, and formats query parameters.",
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
		Description:   "Create a new page. The title field is required. Supports setting content in lexical or mobiledoc format and associating tags/authors.",
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
		Description: "Update an existing page by ID. The updated_at field is required for optimistic locking. Supports partial updates — only provided fields are changed.",
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
		Description:   "Create a duplicate of an existing page. The new page is created in draft status with a modified title indicating it is a copy.",
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
		Description:   "Permanently delete a page by its ID. This action cannot be undone.",
		Tags:          []string{"Pages"},
		DefaultStatus: http.StatusNoContent,
	}
	huma.Register(api, deleteOp, func(_ context.Context, _ *schema.DeletePageInput) (*schema.AdminNoContentOutput, error) {
		return &schema.AdminNoContentOutput{}, nil
	})
}
