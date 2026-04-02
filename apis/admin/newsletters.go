package admin

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/syhily/kobato/apis/schema"
)

func addNewslettersRoutes(api huma.API) {
	listOp := huma.Operation{
		OperationID: "admin-list-newsletters",
		Method:      http.MethodGet,
		Path:        "/newsletters",
		Summary:     "List newsletters",
		Description: "Browse newsletters with include/fields/filter/limit/page/order parameters.",
		Tags:        []string{"Newsletters"},
	}
	huma.Register(api, listOp, func(_ context.Context, _ *schema.NewslettersBrowseInput) (*schema.ListNewslettersOutput, error) {
		return &schema.ListNewslettersOutput{}, nil
	})

	getByIDOp := huma.Operation{
		OperationID: "admin-get-newsletter",
		Method:      http.MethodGet,
		Path:        "/newsletters/{id}",
		Summary:     "Get newsletter by ID",
		Description: "Retrieve a single newsletter by its ID. Supports include and fields query parameters.",
		Tags:        []string{"Newsletters"},
	}
	huma.Register(api, getByIDOp, func(_ context.Context, _ *schema.NewsletterReadByIDInput) (*schema.NewsletterOutput, error) {
		return &schema.NewsletterOutput{}, nil
	})

	createOp := huma.Operation{
		OperationID:   "admin-create-newsletter",
		Method:        http.MethodPost,
		Path:          "/newsletters",
		Summary:       "Create a newsletter",
		Description:   "Create a new newsletter. The name field is required. Multiple newsletters can exist for different audience segments.",
		Tags:          []string{"Newsletters"},
		DefaultStatus: http.StatusCreated,
	}
	huma.Register(api, createOp, func(_ context.Context, _ *schema.CreateNewsletterInput) (*schema.NewsletterOutput, error) {
		return &schema.NewsletterOutput{}, nil
	})

	updateOp := huma.Operation{
		OperationID: "admin-update-newsletter",
		Method:      http.MethodPut,
		Path:        "/newsletters/{id}",
		Summary:     "Update a newsletter",
		Description: "Update an existing newsletter by ID. Certain changes like sender email require email verification before taking effect.",
		Tags:        []string{"Newsletters"},
	}
	huma.Register(api, updateOp, func(_ context.Context, _ *schema.UpdateNewsletterInput) (*schema.NewsletterOutput, error) {
		return &schema.NewsletterOutput{}, nil
	})

	verifyPropertyOp := huma.Operation{
		OperationID: "admin-verify-newsletter-property-update",
		Method:      http.MethodPut,
		Path:        "/newsletters/verifications",
		Summary:     "Verify newsletter property update",
		Description: "Confirm a pending newsletter property change (e.g., sender email) using a verification token sent to the new address.",
		Tags:        []string{"Newsletters"},
	}
	huma.Register(api, verifyPropertyOp, func(_ context.Context, _ *schema.AdminNewsletterVerificationInput) (*schema.NewsletterOutput, error) {
		return &schema.NewsletterOutput{}, nil
	})
}
