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
		Description: "Retrieve a single staff user by their ID. Supports include and fields query parameters. Use 'me' as the ID to get the current user.",
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
		Description: "Retrieve a single staff user by their slug. Supports include and fields query parameters.",
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
		Description: "Retrieve a single staff user by their email address. Supports include and fields query parameters.",
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
		Description: "Retrieve the personal API token for a staff user. The token provides Content API access scoped to the user.",
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
		Description: "Update an existing staff user by ID. Supports updating profile information, role, and notification preferences.",
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
		Description: "Change a staff user's password. Requires the old password and a new password confirmation.",
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
		Description: "Transfer site ownership to another staff user. Only the current owner can perform this action.",
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
		Description: "Regenerate the personal API token for a staff user. The previous token is immediately invalidated.",
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
		Description:   "Permanently delete a staff user. Their posts will be reassigned to the site owner.",
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
		Description: "Retrieve a single pending invitation by its ID.",
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
		Description:   "Revoke a pending invitation. The invite link will no longer be valid.",
		Tags:          []string{"Users"},
		DefaultStatus: http.StatusNoContent,
	}
	huma.Register(api, deleteOp, func(_ context.Context, _ *schema.IDPathParam) (*schema.AdminNoContentOutput, error) {
		return &schema.AdminNoContentOutput{}, nil
	})
}
