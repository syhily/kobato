package admin

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/syhily/kobato/apis/schema"
)

func addSnippetsRoutes(api huma.API) {
	listOp := huma.Operation{
		OperationID: "admin-list-snippets",
		Method:      http.MethodGet,
		Path:        "/snippets",
		Summary:     "List snippets",
		Description: "Browse reusable content snippets with filter, pagination, and ordering support.",
		Tags:        []string{"Snippets"},
	}
	huma.Register(api, listOp, func(_ context.Context, _ *schema.SnippetsBrowseInput) (*schema.AdminSnippetsOutput, error) {
		return &schema.AdminSnippetsOutput{}, nil
	})

	createOp := huma.Operation{
		OperationID: "admin-create-snippet",
		Method:      http.MethodPost,
		Path:        "/snippets",
		Summary:     "Create snippet",
		Description: "Create a new reusable content snippet. Requires name and mobiledoc content.",
		Tags:        []string{"Snippets"},
	}
	huma.Register(api, createOp, func(_ context.Context, _ *schema.CreateSnippetInput) (*schema.AdminSnippetOutput, error) {
		return &schema.AdminSnippetOutput{}, nil
	})

	getByIDOp := huma.Operation{
		OperationID: "admin-read-snippet",
		Method:      http.MethodGet,
		Path:        "/snippets/{id}",
		Summary:     "Read snippet",
		Description: "Retrieve a single snippet by its ID.",
		Tags:        []string{"Snippets"},
	}
	huma.Register(api, getByIDOp, func(_ context.Context, _ *schema.SnippetReadInput) (*schema.AdminSnippetOutput, error) {
		return &schema.AdminSnippetOutput{}, nil
	})

	updateOp := huma.Operation{
		OperationID: "admin-update-snippet",
		Method:      http.MethodPut,
		Path:        "/snippets/{id}",
		Summary:     "Update snippet",
		Description: "Update an existing snippet by ID. Supports partial updates to name, mobiledoc, and lexical content.",
		Tags:        []string{"Snippets"},
	}
	huma.Register(api, updateOp, func(_ context.Context, _ *schema.UpdateSnippetInput) (*schema.AdminSnippetOutput, error) {
		return &schema.AdminSnippetOutput{}, nil
	})

	deleteOp := huma.Operation{
		OperationID: "admin-delete-snippet",
		Method:      http.MethodDelete,
		Path:        "/snippets/{id}",
		Summary:     "Delete snippet",
		Description: "Permanently delete a snippet by its ID.",
		Tags:        []string{"Snippets"},
	}
	huma.Register(api, deleteOp, func(_ context.Context, _ *schema.IDPathParam) (*schema.AdminNoContentOutput, error) {
		return &schema.AdminNoContentOutput{}, nil
	})
}
