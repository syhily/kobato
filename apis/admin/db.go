package admin

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/syhily/kobato/apis/schema"
)

func addDBRoutes(api huma.API) {
	exportOp := huma.Operation{
		OperationID: "admin-export-db",
		Method:      http.MethodGet,
		Path:        "/db",
		Summary:     "Export database",
		Tags:        []string{"DB"},
	}
	huma.Register(api, exportOp, func(_ context.Context, _ *schema.EmptyInput) (*schema.AdminDBOutput, error) {
		return &schema.AdminDBOutput{}, nil
	})

	importOp := huma.Operation{
		OperationID: "admin-import-db",
		Method:      http.MethodPost,
		Path:        "/db",
		Summary:     "Import database",
		Tags:        []string{"DB"},
	}
	huma.Register(api, importOp, func(_ context.Context, _ *schema.EmptyInput) (*schema.AdminDBOutput, error) {
		return &schema.AdminDBOutput{}, nil
	})

	deleteOp := huma.Operation{
		OperationID: "admin-delete-db",
		Method:      http.MethodDelete,
		Path:        "/db",
		Summary:     "Delete all database content",
		Tags:        []string{"DB"},
	}
	huma.Register(api, deleteOp, func(_ context.Context, _ *schema.EmptyInput) (*schema.AdminDBOutput, error) {
		return &schema.AdminDBOutput{}, nil
	})

	backupOp := huma.Operation{
		OperationID: "admin-backup-db",
		Method:      http.MethodPost,
		Path:        "/db/backup",
		Summary:     "Backup database",
		Tags:        []string{"DB"},
	}
	huma.Register(api, backupOp, func(_ context.Context, _ *schema.EmptyInput) (*schema.AdminDBOutput, error) {
		return &schema.AdminDBOutput{}, nil
	})

	inlineMediaOp := huma.Operation{
		OperationID: "admin-inline-db-media",
		Method:      http.MethodPost,
		Path:        "/db/media/inline",
		Summary:     "Inline DB media",
		Tags:        []string{"DB"},
	}
	huma.Register(api, inlineMediaOp, func(_ context.Context, _ *schema.EmptyInput) (*schema.AdminDBOutput, error) {
		return &schema.AdminDBOutput{}, nil
	})
}
