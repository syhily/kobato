package schema

type AdminCommentsOutput struct {
	Comments []AdminCommentResource `json:"comments"`
	Meta     BrowseMeta             `json:"meta"`
}

type AdminCommentOutput struct {
	Comments []AdminCommentResource `json:"comments"`
}

type AdminCommentResource struct {
	ID          string                 `json:"id"`
	PostID      string                 `json:"post_id"`
	MemberID    *string                `json:"member_id"`
	ParentID    *string                `json:"parent_id"`
	InReplyToID *string                `json:"in_reply_to_id"`
	Status      string                 `json:"status"`
	HTML        *string                `json:"html"`
	EditedAt    *string                `json:"edited_at"`
	CreatedAt   string                 `json:"created_at"`
	UpdatedAt   string                 `json:"updated_at"`
	Member      *MemberResource        `json:"member,omitempty"`
	LikesCount  *int                   `json:"likes_count,omitempty"`
	Liked       *bool                  `json:"liked,omitempty"`
	Replies     []AdminCommentResource `json:"replies,omitempty"`
	Count       *CommentCountMeta      `json:"count,omitempty"`
}

type CommentCountMeta struct {
	Replies int `json:"replies"`
	Likes   int `json:"likes"`
}

type CommentInclude string

const (
	CommentIncludePost          CommentInclude = "post"
	CommentIncludeMember        CommentInclude = "member"
	CommentIncludeReplies       CommentInclude = "replies"
	CommentIncludeRepliesMember CommentInclude = "replies.member"
)

type CommentBrowseQueryParams struct {
	CommonBrowseQueryParams
	PostID                string           `query:"post_id,omitempty" doc:"Filter comments by post ID"`
	Include               []CommentInclude `query:"include,omitempty" doc:"Supported values: post, member, replies, replies.member"`
	ImpersonateMemberUUID *string          `query:"impersonate_member_uuid,omitempty" doc:"UUID of member to impersonate for liked status"`
}

type CommentsBrowseInput struct {
	CommentBrowseQueryParams
}

type CommentsByPostBrowseInput struct {
	PostIDPathParam
	CommonBrowseQueryParams
	Include               []CommentInclude `query:"include,omitempty" doc:"Supported values: post, member, replies, replies.member"`
	ImpersonateMemberUUID *string          `query:"impersonate_member_uuid,omitempty" doc:"UUID of member to impersonate for liked status"`
}

type CommentReadInput struct {
	IDPathParam
	Include []CommentInclude `query:"include,omitempty" doc:"Supported values: post, member, replies, replies.member"`
}

type CreateCommentBody struct {
	MemberID    string  `json:"member_id"`
	HTML        string  `json:"html"`
	PostID      *string `json:"post_id,omitempty"`
	ParentID    *string `json:"parent_id,omitempty"`
	InReplyToID *string `json:"in_reply_to_id,omitempty"`
	CreatedAt   *string `json:"created_at,omitempty"`
}

type CreateCommentInput struct {
	Include []CommentInclude `query:"include,omitempty" doc:"Supported values: post, member, replies, replies.member"`
	Body    struct {
		Comments []CreateCommentBody `json:"comments"`
	}
}

type UpdateCommentBody struct {
	Status *string `json:"status,omitempty" enum:"published,hidden,deleted"`
}

type UpdateCommentInput struct {
	IDPathParam
	Body struct {
		Comments []UpdateCommentBody `json:"comments"`
	}
}
