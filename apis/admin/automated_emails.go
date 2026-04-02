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
		Description: "Browse all configured automated email sequences.",
		Tags:        []string{"Automated Emails"},
	}
	huma.Register(api, listOp, func(_ context.Context, _ *schema.CommonBrowseQueryParams) (*schema.AdminAutomatedEmailsOutput, error) {
		return &schema.AdminAutomatedEmailsOutput{}, nil
	})

	createOp := huma.Operation{
		OperationID: "admin-create-automated-email",
		Method:      http.MethodPost,
		Path:        "/automated_emails",
		Summary:     "Create automated email",
		Description: "Create a new automated email with a trigger, content, and optional scheduling options.",
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
		Description: "Retrieve a single automated email by its ID.",
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
		Description: "Update an existing automated email by ID. Supports changing content, trigger, and scheduling.",
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
		Description: "Permanently delete an automated email by its ID.",
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
		Description: "Send a test version of an automated email to the specified recipients for preview.",
		Tags:        []string{"Automated Emails"},
	}
	huma.Register(api, testOp, func(_ context.Context, _ *schema.TestAutomatedEmailInput) (*schema.AdminNoContentOutput, error) {
		return &schema.AdminNoContentOutput{}, nil
	})
}
