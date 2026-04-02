package admin

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/syhily/kobato/apis/schema"
)

func addCommentsRoutes(api huma.API) {
	listOp := huma.Operation{
		OperationID: "admin-list-comments",
		Method:      http.MethodGet,
		Path:        "/comments",
		Summary:     "List comments",
		Tags:        []string{"Comments"},
	}
	huma.Register(api, listOp, func(_ context.Context, _ *schema.CommentsBrowseInput) (*schema.AdminCommentsOutput, error) {
		return &schema.AdminCommentsOutput{}, nil
	})

	createOp := huma.Operation{
		OperationID: "admin-create-comment",
		Method:      http.MethodPost,
		Path:        "/comments",
		Summary:     "Create a comment",
		Tags:        []string{"Comments"},
	}
	huma.Register(api, createOp, func(_ context.Context, _ *schema.CreateCommentInput) (*schema.AdminCommentOutput, error) {
		return &schema.AdminCommentOutput{}, nil
	})

	getByIDOp := huma.Operation{
		OperationID: "admin-read-comment",
		Method:      http.MethodGet,
		Path:        "/comments/{id}",
		Summary:     "Read comment",
		Tags:        []string{"Comments"},
	}
	huma.Register(api, getByIDOp, func(_ context.Context, _ *schema.CommentReadInput) (*schema.AdminCommentOutput, error) {
		return &schema.AdminCommentOutput{}, nil
	})

	listRepliesOp := huma.Operation{
		OperationID: "admin-list-comment-replies",
		Method:      http.MethodGet,
		Path:        "/comments/{id}/replies",
		Summary:     "List comment replies",
		Tags:        []string{"Comments"},
	}
	huma.Register(api, listRepliesOp, func(_ context.Context, _ *schema.IDPathParam) (*schema.AdminCommentsOutput, error) {
		return &schema.AdminCommentsOutput{}, nil
	})

	listReportsOp := huma.Operation{
		OperationID: "admin-list-comment-reports",
		Method:      http.MethodGet,
		Path:        "/comments/{id}/reports",
		Summary:     "List comment reports",
		Tags:        []string{"Comments"},
	}
	huma.Register(api, listReportsOp, func(_ context.Context, _ *schema.IDPathParam) (*schema.AdminCommentsOutput, error) {
		return &schema.AdminCommentsOutput{}, nil
	})

	listLikesOp := huma.Operation{
		OperationID: "admin-list-comment-likes",
		Method:      http.MethodGet,
		Path:        "/comments/{id}/likes",
		Summary:     "List comment likes",
		Tags:        []string{"Comments"},
	}
	huma.Register(api, listLikesOp, func(_ context.Context, _ *schema.IDPathParam) (*schema.AdminCommentsOutput, error) {
		return &schema.AdminCommentsOutput{}, nil
	})

	updateOp := huma.Operation{
		OperationID: "admin-update-comment",
		Method:      http.MethodPut,
		Path:        "/comments/{id}",
		Summary:     "Update comment",
		Tags:        []string{"Comments"},
	}
	huma.Register(api, updateOp, func(_ context.Context, _ *schema.UpdateCommentInput) (*schema.AdminCommentOutput, error) {
		return &schema.AdminCommentOutput{}, nil
	})

	listByPostOp := huma.Operation{
		OperationID: "admin-list-comments-by-post",
		Method:      http.MethodGet,
		Path:        "/comments/post/{post_id}",
		Summary:     "List comments by post",
		Tags:        []string{"Comments"},
	}
	huma.Register(api, listByPostOp, func(_ context.Context, _ *schema.CommentsByPostBrowseInput) (*schema.AdminCommentsOutput, error) {
		return &schema.AdminCommentsOutput{}, nil
	})
}
