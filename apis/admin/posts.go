package admin

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/syhily/kobato/apis/schema"
)

func addPostsRoutes(api huma.API) {
	listOp := huma.Operation{
		OperationID: "admin-list-posts",
		Method:      http.MethodGet,
		Path:        "/posts",
		Summary:     "List posts",
		Description: "Browse posts with include/fields/filter/limit/page/order/formats parameters.",
		Tags:        []string{"Posts"},
	}
	huma.Register(api, listOp, func(_ context.Context, _ *schema.AdminPostsBrowseInput) (*schema.AdminListPostsOutput, error) {
		return &schema.AdminListPostsOutput{}, nil
	})

	exportOp := huma.Operation{
		OperationID: "admin-export-posts-csv",
		Method:      http.MethodGet,
		Path:        "/posts/export",
		Summary:     "Export post analytics CSV",
		Description: "Export post analytics data as a CSV file. Supports filter, limit, and order query parameters to control which posts are included.",
		Tags:        []string{"Posts"},
		Responses: map[string]*huma.Response{
			"200": {
				Description: "CSV export",
				Content: map[string]*huma.MediaType{
					"text/csv": {},
				},
			},
		},
	}
	huma.Register(api, exportOp, func(_ context.Context, _ *schema.AdminPostExportInput) (*schema.AdminCSVExportOutput, error) {
		return &schema.AdminCSVExportOutput{}, nil
	})

	bulkDeleteOp := huma.Operation{
		OperationID: "admin-bulk-delete-posts",
		Method:      http.MethodDelete,
		Path:        "/posts",
		Summary:     "Bulk delete posts",
		Description: "Permanently delete multiple posts matching the given filter. Use the filter query parameter to specify which posts to delete.",
		Tags:        []string{"Posts"},
	}
	huma.Register(api, bulkDeleteOp, func(_ context.Context, _ *schema.AdminPostBulkDeleteInput) (*schema.AdminBulkActionOutput, error) {
		return &schema.AdminBulkActionOutput{}, nil
	})

	bulkEditOp := huma.Operation{
		OperationID: "admin-bulk-edit-posts",
		Method:      http.MethodPut,
		Path:        "/posts/bulk",
		Summary:     "Bulk edit posts",
		Description: "Apply a bulk action to multiple posts matching the given filter. Supported actions include adding/removing tags, changing access level, and more.",
		Tags:        []string{"Posts"},
	}
	huma.Register(api, bulkEditOp, func(_ context.Context, _ *schema.AdminPostBulkEditInput) (*schema.AdminBulkActionOutput, error) {
		return &schema.AdminBulkActionOutput{}, nil
	})

	getByIDOp := huma.Operation{
		OperationID: "admin-get-post-by-id",
		Method:      http.MethodGet,
		Path:        "/posts/{id}",
		Summary:     "Get post by ID",
		Description: "Retrieve a single post by its ID. Supports include, fields, and formats query parameters.",
		Tags:        []string{"Posts"},
	}
	huma.Register(api, getByIDOp, func(_ context.Context, _ *schema.AdminPostReadByIDInput) (*schema.AdminPostOutput, error) {
		return &schema.AdminPostOutput{}, nil
	})

	getBySlugOp := huma.Operation{
		OperationID: "admin-get-post-by-slug",
		Method:      http.MethodGet,
		Path:        "/posts/slug/{slug}",
		Summary:     "Get post by slug",
		Description: "Retrieve a single post by its slug. Supports include, fields, and formats query parameters.",
		Tags:        []string{"Posts"},
	}
	huma.Register(api, getBySlugOp, func(_ context.Context, _ *schema.AdminPostReadBySlugInput) (*schema.AdminPostOutput, error) {
		return &schema.AdminPostOutput{}, nil
	})

	createOp := huma.Operation{
		OperationID:   "admin-create-post",
		Method:        http.MethodPost,
		Path:          "/posts",
		Summary:       "Create a post",
		Description:   "Create a new post. The title field is required. Supports setting content in lexical or mobiledoc format, scheduling, and associating tags/authors.",
		Tags:          []string{"Posts"},
		DefaultStatus: http.StatusCreated,
	}
	huma.Register(api, createOp, func(_ context.Context, _ *schema.CreatePostInput) (*schema.AdminPostOutput, error) {
		return &schema.AdminPostOutput{}, nil
	})

	updateOp := huma.Operation{
		OperationID: "admin-update-post",
		Method:      http.MethodPut,
		Path:        "/posts/{id}",
		Summary:     "Update a post",
		Description: "Update an existing post by ID. The updated_at field is required for optimistic locking. Supports partial updates — only provided fields are changed.",
		Tags:        []string{"Posts"},
	}
	huma.Register(api, updateOp, func(_ context.Context, _ *schema.UpdatePostInput) (*schema.AdminPostOutput, error) {
		return &schema.AdminPostOutput{}, nil
	})

	copyOp := huma.Operation{
		OperationID:   "admin-copy-post",
		Method:        http.MethodPost,
		Path:          "/posts/{id}/copy",
		Summary:       "Copy a post",
		Description:   "Create a duplicate of an existing post. The new post is created in draft status with a modified title indicating it is a copy.",
		Tags:          []string{"Posts"},
		DefaultStatus: http.StatusCreated,
	}
	huma.Register(api, copyOp, func(_ context.Context, _ *schema.CopyPostInput) (*schema.AdminPostOutput, error) {
		return &schema.AdminPostOutput{}, nil
	})

	deleteOp := huma.Operation{
		OperationID:   "admin-delete-post",
		Method:        http.MethodDelete,
		Path:          "/posts/{id}",
		Summary:       "Delete a post",
		Description:   "Permanently delete a post by its ID. This action cannot be undone.",
		Tags:          []string{"Posts"},
		DefaultStatus: http.StatusNoContent,
	}
	huma.Register(api, deleteOp, func(_ context.Context, _ *schema.DeletePostInput) (*schema.AdminNoContentOutput, error) {
		return &schema.AdminNoContentOutput{}, nil
	})
}
