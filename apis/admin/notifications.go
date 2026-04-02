package admin

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/syhily/kobato/apis/schema"
)

func addNotificationsRoutes(api huma.API) {
	listOp := huma.Operation{
		OperationID: "admin-list-notifications",
		Method:      http.MethodGet,
		Path:        "/notifications",
		Summary:     "List notifications",
		Description: "Browse all active notifications for the current user.",
		Tags:        []string{"Notifications"},
	}
	huma.Register(api, listOp, func(_ context.Context, _ *schema.EmptyInput) (*schema.AdminNotificationsOutput, error) {
		return &schema.AdminNotificationsOutput{}, nil
	})

	createOp := huma.Operation{
		OperationID: "admin-create-notification",
		Method:      http.MethodPost,
		Path:        "/notifications",
		Summary:     "Create notification",
		Description: "Create a new notification to display in the admin interface.",
		Tags:        []string{"Notifications"},
	}
	huma.Register(api, createOp, func(_ context.Context, _ *schema.CreateNotificationInput) (*schema.AdminNotificationsOutput, error) {
		return &schema.AdminNotificationsOutput{}, nil
	})

	deleteOp := huma.Operation{
		OperationID: "admin-delete-notification",
		Method:      http.MethodDelete,
		Path:        "/notifications/{notification_id}",
		Summary:     "Delete notification",
		Description: "Dismiss a notification by marking it as seen.",
		Tags:        []string{"Notifications"},
	}
	huma.Register(api, deleteOp, func(_ context.Context, _ *schema.NotificationIDPathParam) (*schema.AdminNoContentOutput, error) {
		return &schema.AdminNoContentOutput{}, nil
	})
}
