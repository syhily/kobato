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
		Tags:        []string{"Recommendations"},
	}
	huma.Register(api, listOp, func(_ context.Context, _ *schema.CommonBrowseQueryParams) (*schema.AdminRecommendationsOutput, error) {
		return &schema.AdminRecommendationsOutput{}, nil
	})

	createOp := huma.Operation{
		OperationID: "admin-create-recommendation",
		Method:      http.MethodPost,
		Path:        "/recommendations",
		Summary:     "Create recommendation",
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
		Tags:        []string{"Recommendations"},
	}
	huma.Register(api, listIncomingOp, func(_ context.Context, _ *schema.CommonBrowseQueryParams) (*schema.AdminIncomingRecommendationsOutput, error) {
		return &schema.AdminIncomingRecommendationsOutput{}, nil
	})

	getByIDOp := huma.Operation{
		OperationID: "admin-read-recommendation",
		Method:      http.MethodGet,
		Path:        "/recommendations/{id}",
		Summary:     "Read recommendation",
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
		Tags:        []string{"Recommendations"},
	}
	huma.Register(api, deleteOp, func(_ context.Context, _ *schema.IDPathParam) (*schema.AdminNoContentOutput, error) {
		return &schema.AdminNoContentOutput{}, nil
	})
}
