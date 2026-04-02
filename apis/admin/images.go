package admin

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/syhily/kobato/apis/schema"
)

func addImagesRoutes(api huma.API) {
	op := huma.Operation{
		OperationID:   "admin-upload-image",
		Method:        http.MethodPost,
		Path:          "/images/upload",
		Summary:       "Upload an image",
		Description:   "Upload an image file. Supported formats: JPEG, GIF, PNG, SVG, WebP.",
		Tags:          []string{"Images"},
		DefaultStatus: http.StatusCreated,
	}
	huma.Register(api, op, func(_ context.Context, _ *schema.ImageUploadInput) (*schema.ImageUploadOutput, error) {
		return &schema.ImageUploadOutput{}, nil
	})
}
