package admin

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/syhily/kobato/apis/schema"
)

func addRecommendationsRoutes(api huma.API) {
	listOp := huma.Operation{
		OperationID: "admin-list-recommendations",
		Method:      http.MethodGet,
		Path:        "/recommendations",
		Summary:     "List recommendations",
		Description: "Browse outgoing site recommendations with pagination and ordering support.",
		Tags:        []string{"Recommendations"},
	}
	huma.Register(api, listOp, func(_ context.Context, _ *schema.AdminRecommendationsBrowseInput) (*schema.AdminRecommendationsOutput, error) {
		return &schema.AdminRecommendationsOutput{}, nil
	})

	createOp := huma.Operation{
		OperationID: "admin-create-recommendation",
		Method:      http.MethodPost,
		Path:        "/recommendations",
		Summary:     "Create recommendation",
		Description: "Create a new outgoing recommendation for another publication or website.",
		Tags:        []string{"Recommendations"},
	}
	huma.Register(api, createOp, func(_ context.Context, _ *schema.CreateRecommendationInput) (*schema.AdminRecommendationOutput, error) {
		return &schema.AdminRecommendationOutput{}, nil
	})

	checkOp := huma.Operation{
		OperationID: "admin-check-recommendations",
		Method:      http.MethodPost,
		Path:        "/recommendations/check",
		Summary:     "Check recommendations",
		Description: "Check whether a URL is already recommended and retrieve metadata about the target site.",
		Tags:        []string{"Recommendations"},
	}
	huma.Register(api, checkOp, func(_ context.Context, _ *schema.CheckRecommendationInput) (*schema.AdminNoContentOutput, error) {
		return &schema.AdminNoContentOutput{}, nil
	})

	listIncomingOp := huma.Operation{
		OperationID: "admin-list-incoming-recommendations",
		Method:      http.MethodGet,
		Path:        "/incoming_recommendations",
		Summary:     "List incoming recommendations",
		Description: "Browse incoming recommendations from other sites that recommend this publication.",
		Tags:        []string{"Recommendations"},
	}
	huma.Register(api, listIncomingOp, func(_ context.Context, _ *schema.AdminIncomingRecommendationsBrowseInput) (*schema.AdminIncomingRecommendationsOutput, error) {
		return &schema.AdminIncomingRecommendationsOutput{}, nil
	})

	getByIDOp := huma.Operation{
		OperationID: "admin-read-recommendation",
		Method:      http.MethodGet,
		Path:        "/recommendations/{id}",
		Summary:     "Read recommendation",
		Description: "Retrieve a single recommendation by its ID.",
		Tags:        []string{"Recommendations"},
	}
	huma.Register(api, getByIDOp, func(_ context.Context, _ *schema.IDPathParam) (*schema.AdminRecommendationOutput, error) {
		return &schema.AdminRecommendationOutput{}, nil
	})

	updateOp := huma.Operation{
		OperationID: "admin-update-recommendation",
		Method:      http.MethodPut,
		Path:        "/recommendations/{id}",
		Summary:     "Update recommendation",
		Description: "Update an existing recommendation by ID. Supports changing the title, reason, excerpt, and featured image.",
		Tags:        []string{"Recommendations"},
	}
	huma.Register(api, updateOp, func(_ context.Context, _ *schema.UpdateRecommendationInput) (*schema.AdminRecommendationOutput, error) {
		return &schema.AdminRecommendationOutput{}, nil
	})

	deleteOp := huma.Operation{
		OperationID: "admin-delete-recommendation",
		Method:      http.MethodDelete,
		Path:        "/recommendations/{id}",
		Summary:     "Delete recommendation",
		Description: "Permanently delete an outgoing recommendation by its ID.",
		Tags:        []string{"Recommendations"},
	}
	huma.Register(api, deleteOp, func(_ context.Context, _ *schema.IDPathParam) (*schema.AdminNoContentOutput, error) {
		return &schema.AdminNoContentOutput{}, nil
	})
}
