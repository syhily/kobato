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
		Description: "Browse all comments across posts with filter, pagination, and include support.",
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
		Description: "Create a new comment on a post. Requires member_id and html content. Can be a top-level comment or a reply to an existing comment.",
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
		Description: "Retrieve a single comment by its ID, including optional related data via the include parameter.",
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
		Description: "Browse replies to a specific comment. Supports pagination and include parameters.",
		Tags:        []string{"Comments"},
	}
	huma.Register(api, listRepliesOp, func(_ context.Context, _ *schema.CommentRepliesBrowseInput) (*schema.AdminCommentsOutput, error) {
		return &schema.AdminCommentsOutput{}, nil
	})

	listReportsOp := huma.Operation{
		OperationID: "admin-list-comment-reports",
		Method:      http.MethodGet,
		Path:        "/comments/{id}/reports",
		Summary:     "List comment reports",
		Description: "Browse reports filed against a specific comment. Supports pagination.",
		Tags:        []string{"Comments"},
	}
	huma.Register(api, listReportsOp, func(_ context.Context, _ *schema.CommentReportsBrowseInput) (*schema.AdminCommentsOutput, error) {
		return &schema.AdminCommentsOutput{}, nil
	})

	listLikesOp := huma.Operation{
		OperationID: "admin-list-comment-likes",
		Method:      http.MethodGet,
		Path:        "/comments/{id}/likes",
		Summary:     "List comment likes",
		Description: "Browse likes on a specific comment. Supports pagination.",
		Tags:        []string{"Comments"},
	}
	huma.Register(api, listLikesOp, func(_ context.Context, _ *schema.CommentLikesBrowseInput) (*schema.AdminCommentsOutput, error) {
		return &schema.AdminCommentsOutput{}, nil
	})

	updateOp := huma.Operation{
		OperationID: "admin-update-comment",
		Method:      http.MethodPut,
		Path:        "/comments/{id}",
		Summary:     "Update comment",
		Description: "Update a comment's status. Administrators can change the status to published, hidden, or deleted.",
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
		Description: "Browse comments belonging to a specific post. Supports pagination, include, and member impersonation for liked status.",
		Tags:        []string{"Comments"},
	}
	huma.Register(api, listByPostOp, func(_ context.Context, _ *schema.CommentsByPostBrowseInput) (*schema.AdminCommentsOutput, error) {
		return &schema.AdminCommentsOutput{}, nil
	})
}
