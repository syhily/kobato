package admin

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/syhily/kobato/apis/schema"
)

func addUsersRoutes(api huma.API) {
	listOp := huma.Operation{
		OperationID: "admin-list-users",
		Method:      http.MethodGet,
		Path:        "/users",
		Summary:     "List users",
		Description: "Browse users with include/fields/filter/limit/page/order parameters.",
		Tags:        []string{"Users"},
	}
	huma.Register(api, listOp, func(_ context.Context, _ *schema.UsersBrowseInput) (*schema.ListUsersOutput, error) {
		return &schema.ListUsersOutput{}, nil
	})

	getByIDOp := huma.Operation{
		OperationID: "admin-get-user",
		Method:      http.MethodGet,
		Path:        "/users/{id}",
		Summary:     "Get user by ID",
		Tags:        []string{"Users"},
	}
	huma.Register(api, getByIDOp, func(_ context.Context, _ *schema.UserReadByIDInput) (*schema.UserOutput, error) {
		return &schema.UserOutput{}, nil
	})

	getBySlugOp := huma.Operation{
		OperationID: "admin-get-user-by-slug",
		Method:      http.MethodGet,
		Path:        "/users/slug/{slug}",
		Summary:     "Get user by slug",
		Tags:        []string{"Users"},
	}
	huma.Register(api, getBySlugOp, func(_ context.Context, _ *schema.UserReadBySlugInput) (*schema.UserOutput, error) {
		return &schema.UserOutput{}, nil
	})

	getByEmailOp := huma.Operation{
		OperationID: "admin-get-user-by-email",
		Method:      http.MethodGet,
		Path:        "/users/email/{email}",
		Summary:     "Get user by email",
		Tags:        []string{"Users"},
	}
	huma.Register(api, getByEmailOp, func(_ context.Context, _ *schema.UserReadByEmailInput) (*schema.UserOutput, error) {
		return &schema.UserOutput{}, nil
	})

	getTokenOp := huma.Operation{
		OperationID: "admin-get-user-token",
		Method:      http.MethodGet,
		Path:        "/users/{id}/token",
		Summary:     "Get user personal token",
		Tags:        []string{"Users"},
	}
	huma.Register(api, getTokenOp, func(_ context.Context, _ *schema.IDPathParam) (*schema.AdminUserTokenOutput, error) {
		return &schema.AdminUserTokenOutput{}, nil
	})

	updateOp := huma.Operation{
		OperationID: "admin-update-user",
		Method:      http.MethodPut,
		Path:        "/users/{id}",
		Summary:     "Update a user",
		Tags:        []string{"Users"},
	}
	huma.Register(api, updateOp, func(_ context.Context, _ *schema.UpdateUserInput) (*schema.UserOutput, error) {
		return &schema.UserOutput{}, nil
	})

	changePasswordOp := huma.Operation{
		OperationID: "admin-change-user-password",
		Method:      http.MethodPut,
		Path:        "/users/password",
		Summary:     "Change user password",
		Tags:        []string{"Users"},
	}
	huma.Register(api, changePasswordOp, func(_ context.Context, _ *schema.AdminUserChangePasswordInput) (*schema.AdminUserPasswordOutput, error) {
		return &schema.AdminUserPasswordOutput{}, nil
	})

	transferOwnerOp := huma.Operation{
		OperationID: "admin-transfer-ownership",
		Method:      http.MethodPut,
		Path:        "/users/owner",
		Summary:     "Transfer site ownership",
		Tags:        []string{"Users"},
	}
	huma.Register(api, transferOwnerOp, func(_ context.Context, _ *schema.AdminTransferOwnershipInput) (*schema.AdminTransferOwnershipOutput, error) {
		return &schema.AdminTransferOwnershipOutput{}, nil
	})

	regenerateTokenOp := huma.Operation{
		OperationID: "admin-regenerate-user-token",
		Method:      http.MethodPut,
		Path:        "/users/{id}/token",
		Summary:     "Regenerate user personal token",
		Tags:        []string{"Users"},
	}
	huma.Register(api, regenerateTokenOp, func(_ context.Context, _ *schema.IDPathParam) (*schema.AdminUserTokenOutput, error) {
		return &schema.AdminUserTokenOutput{}, nil
	})

	deleteOp := huma.Operation{
		OperationID:   "admin-delete-user",
		Method:        http.MethodDelete,
		Path:          "/users/{id}",
		Summary:       "Delete a user",
		Tags:          []string{"Users"},
		DefaultStatus: http.StatusNoContent,
	}
	huma.Register(api, deleteOp, func(_ context.Context, _ *schema.IDPathParam) (*schema.AdminNoContentOutput, error) {
		return &schema.AdminNoContentOutput{}, nil
	})
}

func addRolesRoutes(api huma.API) {
	listOp := huma.Operation{
		OperationID: "admin-list-roles",
		Method:      http.MethodGet,
		Path:        "/roles",
		Summary:     "List roles",
		Description: "Returns all available staff user roles.",
		Tags:        []string{"Users"},
	}
	huma.Register(api, listOp, func(_ context.Context, _ *schema.RolesBrowseInput) (*schema.ListRolesOutput, error) {
		return &schema.ListRolesOutput{}, nil
	})
}

func addInvitesRoutes(api huma.API) {
	listOp := huma.Operation{
		OperationID: "admin-list-invites",
		Method:      http.MethodGet,
		Path:        "/invites",
		Summary:     "List invites",
		Description: "Browse all pending invitations.",
		Tags:        []string{"Users"},
	}
	huma.Register(api, listOp, func(_ context.Context, _ *schema.CommonBrowseQueryParams) (*schema.ListInvitesOutput, error) {
		return &schema.ListInvitesOutput{}, nil
	})

	getByIDOp := huma.Operation{
		OperationID: "admin-get-invite",
		Method:      http.MethodGet,
		Path:        "/invites/{id}",
		Summary:     "Get invite by ID",
		Tags:        []string{"Users"},
	}
	huma.Register(api, getByIDOp, func(_ context.Context, _ *schema.IDPathParam) (*schema.InviteOutput, error) {
		return &schema.InviteOutput{}, nil
	})

	createOp := huma.Operation{
		OperationID:   "admin-create-invite",
		Method:        http.MethodPost,
		Path:          "/invites",
		Summary:       "Create an invite",
		Description:   "Invite a new staff user by specifying a role and email address.",
		Tags:          []string{"Users"},
		DefaultStatus: http.StatusCreated,
	}
	huma.Register(api, createOp, func(_ context.Context, _ *schema.CreateInviteInput) (*schema.CreateInviteOutput, error) {
		return &schema.CreateInviteOutput{}, nil
	})

	deleteOp := huma.Operation{
		OperationID:   "admin-delete-invite",
		Method:        http.MethodDelete,
		Path:          "/invites/{id}",
		Summary:       "Delete an invite",
		Tags:          []string{"Users"},
		DefaultStatus: http.StatusNoContent,
	}
	huma.Register(api, deleteOp, func(_ context.Context, _ *schema.IDPathParam) (*schema.AdminNoContentOutput, error) {
		return &schema.AdminNoContentOutput{}, nil
	})
}
