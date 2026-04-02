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
		Tags:        []string{"Snippets"},
	}
	huma.Register(api, deleteOp, func(_ context.Context, _ *schema.IDPathParam) (*schema.AdminNoContentOutput, error) {
		return &schema.AdminNoContentOutput{}, nil
	})
}
