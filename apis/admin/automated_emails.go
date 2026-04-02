package admin

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/syhily/kobato/apis/schema"
)

func addAutomatedEmailsRoutes(api huma.API) {
	listOp := huma.Operation{
		OperationID: "admin-list-automated-emails",
		Method:      http.MethodGet,
		Path:        "/automated_emails",
		Summary:     "List automated emails",
		Tags:        []string{"Automated Emails"},
	}
	huma.Register(api, listOp, func(_ context.Context, _ *schema.EmptyInput) (*schema.AdminAutomatedEmailsOutput, error) {
		return &schema.AdminAutomatedEmailsOutput{}, nil
	})

	createOp := huma.Operation{
		OperationID: "admin-create-automated-email",
		Method:      http.MethodPost,
		Path:        "/automated_emails",
		Summary:     "Create automated email",
		Tags:        []string{"Automated Emails"},
	}
	huma.Register(api, createOp, func(_ context.Context, _ *schema.CreateAutomatedEmailInput) (*schema.AdminAutomatedEmailOutput, error) {
		return &schema.AdminAutomatedEmailOutput{}, nil
	})

	getByIDOp := huma.Operation{
		OperationID: "admin-read-automated-email",
		Method:      http.MethodGet,
		Path:        "/automated_emails/{id}",
		Summary:     "Read automated email",
		Tags:        []string{"Automated Emails"},
	}
	huma.Register(api, getByIDOp, func(_ context.Context, _ *schema.IDPathParam) (*schema.AdminAutomatedEmailOutput, error) {
		return &schema.AdminAutomatedEmailOutput{}, nil
	})

	updateOp := huma.Operation{
		OperationID: "admin-update-automated-email",
		Method:      http.MethodPut,
		Path:        "/automated_emails/{id}",
		Summary:     "Update automated email",
		Tags:        []string{"Automated Emails"},
	}
	huma.Register(api, updateOp, func(_ context.Context, _ *schema.UpdateAutomatedEmailInput) (*schema.AdminAutomatedEmailOutput, error) {
		return &schema.AdminAutomatedEmailOutput{}, nil
	})

	deleteOp := huma.Operation{
		OperationID: "admin-delete-automated-email",
		Method:      http.MethodDelete,
		Path:        "/automated_emails/{id}",
		Summary:     "Delete automated email",
		Tags:        []string{"Automated Emails"},
	}
	huma.Register(api, deleteOp, func(_ context.Context, _ *schema.IDPathParam) (*schema.AdminNoContentOutput, error) {
		return &schema.AdminNoContentOutput{}, nil
	})

	testOp := huma.Operation{
		OperationID: "admin-test-automated-email",
		Method:      http.MethodPost,
		Path:        "/automated_emails/{id}/test",
		Summary:     "Send automated email test",
		Tags:        []string{"Automated Emails"},
	}
	huma.Register(api, testOp, func(_ context.Context, _ *schema.TestAutomatedEmailInput) (*schema.AdminNoContentOutput, error) {
		return &schema.AdminNoContentOutput{}, nil
	})
}
