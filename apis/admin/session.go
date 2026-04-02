package admin

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/syhily/kobato/apis/schema"
)

func addSessionRoutes(api huma.API) {
	createSessionOp := huma.Operation{
		OperationID: "admin-create-session",
		Method:      http.MethodPost,
		Path:        "/session",
		Summary:     "Create session",
		Tags:        []string{"Session"},
	}
	huma.Register(api, createSessionOp, func(_ context.Context, _ *schema.AdminCreateSessionInput) (*schema.AdminSessionOutput, error) {
		return &schema.AdminSessionOutput{}, nil
	})

	deleteSessionOp := huma.Operation{
		OperationID: "admin-delete-session",
		Method:      http.MethodDelete,
		Path:        "/session",
		Summary:     "Delete session",
		Tags:        []string{"Session"},
	}
	huma.Register(api, deleteSessionOp, func(_ context.Context, _ *schema.EmptyInput) (*schema.AdminNoContentOutput, error) {
		return &schema.AdminNoContentOutput{}, nil
	})

	sendVerificationOp := huma.Operation{
		OperationID: "admin-send-session-verification",
		Method:      http.MethodPost,
		Path:        "/session/verify",
		Summary:     "Send session verification code",
		Tags:        []string{"Session"},
	}
	huma.Register(api, sendVerificationOp, func(_ context.Context, _ *schema.EmptyInput) (*schema.AdminNoContentOutput, error) {
		return &schema.AdminNoContentOutput{}, nil
	})

	verifySessionOp := huma.Operation{
		OperationID: "admin-verify-session",
		Method:      http.MethodPut,
		Path:        "/session/verify",
		Summary:     "Verify session",
		Tags:        []string{"Session"},
	}
	huma.Register(api, verifySessionOp, func(_ context.Context, _ *schema.AdminVerifySessionInput) (*schema.AdminSessionOutput, error) {
		return &schema.AdminSessionOutput{}, nil
	})

	listIdentitiesOp := huma.Operation{
		OperationID: "admin-list-identities",
		Method:      http.MethodGet,
		Path:        "/identities",
		Summary:     "List identities",
		Tags:        []string{"Identities"},
	}
	huma.Register(api, listIdentitiesOp, func(_ context.Context, _ *schema.EmptyInput) (*schema.AdminNoContentOutput, error) {
		return &schema.AdminNoContentOutput{}, nil
	})

	passwordResetOp := huma.Operation{
		OperationID: "admin-create-password-reset",
		Method:      http.MethodPost,
		Path:        "/authentication/password_reset",
		Summary:     "Create password reset token",
		Tags:        []string{"Authentication"},
	}
	huma.Register(api, passwordResetOp, func(_ context.Context, _ *schema.EmptyInput) (*schema.AdminAuthenticationMessageOutput, error) {
		return &schema.AdminAuthenticationMessageOutput{}, nil
	})

	resetPasswordOp := huma.Operation{
		OperationID: "admin-update-password-reset",
		Method:      http.MethodPut,
		Path:        "/authentication/password_reset",
		Summary:     "Reset password",
		Tags:        []string{"Authentication"},
	}
	huma.Register(api, resetPasswordOp, func(_ context.Context, _ *schema.EmptyInput) (*schema.AdminAuthenticationMessageOutput, error) {
		return &schema.AdminAuthenticationMessageOutput{}, nil
	})

	acceptInvitationOp := huma.Operation{
		OperationID: "admin-create-auth-invitation",
		Method:      http.MethodPost,
		Path:        "/authentication/invitation",
		Summary:     "Accept invitation",
		Tags:        []string{"Authentication"},
	}
	huma.Register(api, acceptInvitationOp, func(_ context.Context, _ *schema.EmptyInput) (*schema.AdminAuthenticationMessageOutput, error) {
		return &schema.AdminAuthenticationMessageOutput{}, nil
	})

	readInvitationOp := huma.Operation{
		OperationID: "admin-read-auth-invitation",
		Method:      http.MethodGet,
		Path:        "/authentication/invitation",
		Summary:     "Read invitation status",
		Tags:        []string{"Authentication"},
	}
	huma.Register(api, readInvitationOp, func(_ context.Context, _ *schema.EmptyInput) (*schema.AdminAuthenticationMessageOutput, error) {
		return &schema.AdminAuthenticationMessageOutput{}, nil
	})

	createSetupOp := huma.Operation{
		OperationID: "admin-create-auth-setup",
		Method:      http.MethodPost,
		Path:        "/authentication/setup",
		Summary:     "Create authentication setup",
		Tags:        []string{"Authentication"},
	}
	huma.Register(api, createSetupOp, func(_ context.Context, _ *schema.EmptyInput) (*schema.UserOutput, error) {
		return &schema.UserOutput{}, nil
	})

	updateSetupOp := huma.Operation{
		OperationID: "admin-update-auth-setup",
		Method:      http.MethodPut,
		Path:        "/authentication/setup",
		Summary:     "Update authentication setup",
		Tags:        []string{"Authentication"},
	}
	huma.Register(api, updateSetupOp, func(_ context.Context, _ *schema.EmptyInput) (*schema.UserOutput, error) {
		return &schema.UserOutput{}, nil
	})

	readSetupOp := huma.Operation{
		OperationID: "admin-read-auth-setup",
		Method:      http.MethodGet,
		Path:        "/authentication/setup",
		Summary:     "Read authentication setup status",
		Tags:        []string{"Authentication"},
	}
	huma.Register(api, readSetupOp, func(_ context.Context, _ *schema.EmptyInput) (*schema.AdminAuthenticationMessageOutput, error) {
		return &schema.AdminAuthenticationMessageOutput{}, nil
	})

	globalPasswordResetOp := huma.Operation{
		OperationID: "admin-global-password-reset",
		Method:      http.MethodPost,
		Path:        "/authentication/global_password_reset",
		Summary:     "Reset all user passwords",
		Tags:        []string{"Authentication"},
	}
	huma.Register(api, globalPasswordResetOp, func(_ context.Context, _ *schema.EmptyInput) (*schema.AdminNoContentOutput, error) {
		return &schema.AdminNoContentOutput{}, nil
	})
}
