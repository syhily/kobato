package content

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/syhily/kobato/apis/schema"
)

func addNewslettersRoutes(api huma.API) {
	listOp := huma.Operation{
		OperationID: "content-list-newsletters",
		Method:      http.MethodGet,
		Path:        "/newsletters",
		Summary:     "List newsletters",
		Description: "Browse active newsletters with filter/fields/limit/page/order parameters.",
		Tags:        []string{"Newsletters"},
	}
	huma.Register(api, listOp, func(_ context.Context, _ *schema.ContentNewslettersBrowseInput) (*schema.ListContentNewslettersOutput, error) {
		return &schema.ListContentNewslettersOutput{}, nil
	})
}
