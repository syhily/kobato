package admin

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/syhily/kobato/apis/schema"
)

func addMembersRoutes(api huma.API) {
	listOp := huma.Operation{
		OperationID: "admin-list-members",
		Method:      http.MethodGet,
		Path:        "/members",
		Summary:     "List members",
		Description: "Browse members with include/fields/filter/limit/page/order parameters.",
		Tags:        []string{"Members"},
	}
	huma.Register(api, listOp, func(_ context.Context, _ *schema.MembersBrowseInput) (*schema.ListMembersOutput, error) {
		return &schema.ListMembersOutput{}, nil
	})

	bulkDeleteOp := huma.Operation{
		OperationID: "admin-bulk-delete-members",
		Method:      http.MethodDelete,
		Path:        "/members",
		Summary:     "Bulk delete members",
		Description: "Permanently delete multiple members matching the given filter. Returns a job URL to track progress.",
		Tags:        []string{"Members"},
	}
	huma.Register(api, bulkDeleteOp, func(_ context.Context, _ *schema.AdminMemberBulkDeleteInput) (*schema.AdminMemberBulkDestroyOutput, error) {
		return &schema.AdminMemberBulkDestroyOutput{}, nil
	})

	bulkEditOp := huma.Operation{
		OperationID: "admin-bulk-edit-members",
		Method:      http.MethodPut,
		Path:        "/members/bulk",
		Summary:     "Bulk edit members",
		Description: "Apply a bulk action to multiple members matching the given filter. Supported actions include adding/removing labels, unsubscribing from newsletters, and more.",
		Tags:        []string{"Members"},
	}
	huma.Register(api, bulkEditOp, func(_ context.Context, _ *schema.AdminMemberBulkEditInput) (*schema.AdminBulkActionOutput, error) {
		return &schema.AdminBulkActionOutput{}, nil
	})

	getByIDOp := huma.Operation{
		OperationID: "admin-get-member",
		Method:      http.MethodGet,
		Path:        "/members/{id}",
		Summary:     "Get member by ID",
		Description: "Retrieve a single member by their ID. Supports include and fields query parameters.",
		Tags:        []string{"Members"},
	}
	huma.Register(api, getByIDOp, func(_ context.Context, _ *schema.MemberReadByIDInput) (*schema.MemberOutput, error) {
		return &schema.MemberOutput{}, nil
	})

	createOp := huma.Operation{
		OperationID:   "admin-create-member",
		Method:        http.MethodPost,
		Path:          "/members",
		Summary:       "Create a member",
		Description:   "Create a new member with the provided email address and optional name, labels, and newsletter subscriptions.",
		Tags:          []string{"Members"},
		DefaultStatus: http.StatusCreated,
	}
	huma.Register(api, createOp, func(_ context.Context, _ *schema.CreateMemberInput) (*schema.MemberOutput, error) {
		return &schema.MemberOutput{}, nil
	})

	updateOp := huma.Operation{
		OperationID: "admin-update-member",
		Method:      http.MethodPut,
		Path:        "/members/{id}",
		Summary:     "Update a member",
		Description: "Update an existing member by ID. Supports partial updates for name, note, labels, geolocation, newsletters, and comped status.",
		Tags:        []string{"Members"},
	}
	huma.Register(api, updateOp, func(_ context.Context, _ *schema.UpdateMemberInput) (*schema.MemberOutput, error) {
		return &schema.MemberOutput{}, nil
	})

	deleteOp := huma.Operation{
		OperationID:   "admin-delete-member",
		Method:        http.MethodDelete,
		Path:          "/members/{id}",
		Summary:       "Delete a member",
		Description:   "Permanently delete a member by their ID. Optionally cancels their Stripe subscriptions.",
		Tags:          []string{"Members"},
		DefaultStatus: http.StatusNoContent,
	}
	huma.Register(api, deleteOp, func(_ context.Context, _ *schema.DeleteMemberInput) (*schema.AdminNoContentOutput, error) {
		return &schema.AdminNoContentOutput{}, nil
	})

	countStatsOp := huma.Operation{
		OperationID: "admin-member-count-stats",
		Method:      http.MethodGet,
		Path:        "/members/stats/count",
		Summary:     "Get member count statistics",
		Description: "Get historical member count statistics broken down by status (free, paid, comped). Supports date range filtering.",
		Tags:        []string{"Members"},
	}
	huma.Register(api, countStatsOp, func(_ context.Context, _ *schema.MemberCountStatsInput) (*schema.MemberCountStatsOutput, error) {
		return &schema.MemberCountStatsOutput{}, nil
	})

	mrrStatsOp := huma.Operation{
		OperationID: "admin-member-mrr-stats",
		Method:      http.MethodGet,
		Path:        "/members/stats/mrr",
		Summary:     "Get member MRR statistics",
		Description: "Get monthly recurring revenue statistics over time. Supports date range and currency filtering.",
		Tags:        []string{"Members"},
	}
	huma.Register(api, mrrStatsOp, func(_ context.Context, _ *schema.MemberMRRStatsInput) (*schema.MemberMRRStatsOutput, error) {
		return &schema.MemberMRRStatsOutput{}, nil
	})

	eventsOp := huma.Operation{
		OperationID: "admin-member-events",
		Method:      http.MethodGet,
		Path:        "/members/events",
		Summary:     "Get member activity feed",
		Description: "Browse the member activity feed with pagination and filtering. Includes subscription events, login events, email events, and more.",
		Tags:        []string{"Members"},
	}
	huma.Register(api, eventsOp, func(_ context.Context, _ *schema.AdminMemberEventsBrowseInput) (*schema.AdminMemberEventsOutput, error) {
		return &schema.AdminMemberEventsOutput{}, nil
	})

	uploadExportOp := huma.Operation{
		OperationID: "admin-member-upload-export",
		Method:      http.MethodGet,
		Path:        "/members/upload",
		Summary:     "Export members CSV",
		Description: "Export members data as a CSV file. Supports filter, limit, and search parameters to control which members are included.",
		Tags:        []string{"Members"},
		Responses: map[string]*huma.Response{
			"200": {
				Description: "CSV export",
				Content: map[string]*huma.MediaType{
					"text/csv": {},
				},
			},
		},
	}
	huma.Register(api, uploadExportOp, func(_ context.Context, _ *schema.AdminMemberCSVInput) (*schema.AdminCSVExportOutput, error) {
		return &schema.AdminCSVExportOutput{}, nil
	})

	uploadImportOp := huma.Operation{
		OperationID: "admin-member-upload-import",
		Method:      http.MethodPost,
		Path:        "/members/upload",
		Summary:     "Import members CSV",
		Description: "Import members from a CSV file. Supports mapping CSV columns to member fields and associating imported members with labels.",
		Tags:        []string{"Members"},
	}
	huma.Register(api, uploadImportOp, func(_ context.Context, _ *schema.AdminMemberCSVImportInput) (*schema.AdminMemberBulkDestroyOutput, error) {
		return &schema.AdminMemberBulkDestroyOutput{}, nil
	})

	deleteSessionsOp := huma.Operation{
		OperationID:   "admin-member-delete-sessions",
		Method:        http.MethodDelete,
		Path:          "/members/{id}/sessions",
		Summary:       "Delete member sessions",
		Description:   "Revoke all active sessions for a member, forcing them to re-authenticate.",
		Tags:          []string{"Members"},
		DefaultStatus: http.StatusNoContent,
	}
	huma.Register(api, deleteSessionsOp, func(_ context.Context, _ *schema.IDPathParam) (*schema.AdminNoContentOutput, error) {
		return &schema.AdminNoContentOutput{}, nil
	})

	deleteSuppressionOp := huma.Operation{
		OperationID:   "admin-member-delete-email-suppression",
		Method:        http.MethodDelete,
		Path:          "/members/{id}/suppression",
		Summary:       "Delete member email suppression",
		Description:   "Remove email suppression for a member, allowing them to receive emails again after a bounce or complaint.",
		Tags:          []string{"Members"},
		DefaultStatus: http.StatusNoContent,
	}
	huma.Register(api, deleteSuppressionOp, func(_ context.Context, _ *schema.IDPathParam) (*schema.AdminNoContentOutput, error) {
		return &schema.AdminNoContentOutput{}, nil
	})

	createSubscriptionOp := huma.Operation{
		OperationID: "admin-member-create-subscription",
		Method:      http.MethodPost,
		Path:        "/members/{id}/subscriptions",
		Summary:     "Create member subscription",
		Description: "Create a new Stripe subscription for a member with the specified price.",
		Tags:        []string{"Members"},
	}
	huma.Register(api, createSubscriptionOp, func(_ context.Context, _ *schema.AdminCreateMemberSubscriptionInput) (*schema.MemberOutput, error) {
		return &schema.MemberOutput{}, nil
	})

	updateSubscriptionOp := huma.Operation{
		OperationID: "admin-member-update-subscription",
		Method:      http.MethodPut,
		Path:        "/members/{id}/subscriptions/{subscription_id}",
		Summary:     "Update member subscription",
		Description: "Update a member's Stripe subscription. Supports canceling at period end or changing the subscription status.",
		Tags:        []string{"Members"},
	}
	huma.Register(api, updateSubscriptionOp, func(_ context.Context, _ *schema.AdminUpdateMemberSubscriptionInput) (*schema.MemberOutput, error) {
		return &schema.MemberOutput{}, nil
	})

	signinURLop := huma.Operation{
		OperationID: "admin-member-signin-urls",
		Method:      http.MethodGet,
		Path:        "/members/{id}/signin_urls",
		Summary:     "Get member sign-in URLs",
		Description: "Generate an impersonation sign-in URL for a member, allowing staff to log in as the member.",
		Tags:        []string{"Members"},
	}
	huma.Register(api, signinURLop, func(_ context.Context, _ *schema.IDPathParam) (*schema.AdminMemberSigninURLOutput, error) {
		return &schema.AdminMemberSigninURLOutput{}, nil
	})

	disableCommentingOp := huma.Operation{
		OperationID: "admin-member-disable-commenting",
		Method:      http.MethodPost,
		Path:        "/members/{id}/commenting/disable",
		Summary:     "Disable member commenting",
		Description: "Disable commenting for a specific member with a required reason. The member will be unable to post new comments.",
		Tags:        []string{"Members"},
	}
	huma.Register(api, disableCommentingOp, func(_ context.Context, _ *schema.AdminMemberCommentingToggleInput) (*schema.MemberOutput, error) {
		return &schema.MemberOutput{}, nil
	})

	enableCommentingOp := huma.Operation{
		OperationID: "admin-member-enable-commenting",
		Method:      http.MethodPost,
		Path:        "/members/{id}/commenting/enable",
		Summary:     "Enable member commenting",
		Description: "Re-enable commenting for a member that was previously banned from commenting.",
		Tags:        []string{"Members"},
	}
	huma.Register(api, enableCommentingOp, func(_ context.Context, _ *schema.IDPathParam) (*schema.MemberOutput, error) {
		return &schema.MemberOutput{}, nil
	})

	stripeConnectOp := huma.Operation{
		OperationID: "admin-member-stripe-connect",
		Method:      http.MethodGet,
		Path:        "/members/stripe_connect",
		Summary:     "Start Stripe Connect flow",
		Description: "Initialize the Stripe Connect OAuth flow. Returns a redirect URL for connecting a Stripe account in live or test mode.",
		Tags:        []string{"Members"},
	}
	huma.Register(api, stripeConnectOp, func(_ context.Context, _ *struct {
		Mode string `query:"mode,omitempty" enum:"live,test"`
	}) (*schema.AdminNoContentOutput, error) {
		return &schema.AdminNoContentOutput{}, nil
	})
}
