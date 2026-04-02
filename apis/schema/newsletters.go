package schema

type NewsletterCountMeta struct {
	Posts         int `json:"posts"`
	Members       int `json:"members"`
	ActiveMembers int `json:"active_members"`
}

type NewsletterResource struct {
	ID                      string               `json:"id"`
	Slug                    string               `json:"slug"`
	UUID                    string               `json:"uuid"`
	Name                    string               `json:"name"`
	Description             *string              `json:"description"`
	FeedbackEnabled         bool                 `json:"feedback_enabled"`
	SenderName              *string              `json:"sender_name"`
	SenderEmail             *string              `json:"sender_email"`
	SenderReplyTo           string               `json:"sender_reply_to" maxLength:"191"`
	Status                  string               `json:"status" enum:"active,archived"`
	Visibility              string               `json:"visibility" enum:"public,members"`
	SubscribeOnSignup       bool                 `json:"subscribe_on_signup"`
	SortOrder               int                  `json:"sort_order"`
	HeaderImage             *string              `json:"header_image"`
	ShowHeaderIcon          bool                 `json:"show_header_icon"`
	ShowHeaderTitle         bool                 `json:"show_header_title"`
	ShowHeaderName          bool                 `json:"show_header_name"`
	ShowExcerpt             bool                 `json:"show_excerpt"`
	TitleFontCategory       string               `json:"title_font_category" enum:"serif,sans_serif"`
	TitleAlignment          *string              `json:"title_alignment"`
	TitleFontWeight         string               `json:"title_font_weight" enum:"normal,medium,semibold,bold"`
	ShowFeatureImage        bool                 `json:"show_feature_image"`
	BodyFontCategory        string               `json:"body_font_category" enum:"serif,sans_serif"`
	FooterContent           *string              `json:"footer_content"`
	ShowBadge               bool                 `json:"show_badge"`
	ShowPostTitleSection    bool                 `json:"show_post_title_section"`
	ShowCommentCTA          bool                 `json:"show_comment_cta"`
	ShowSubscriptionDetails bool                 `json:"show_subscription_details"`
	ShowLatestPosts         bool                 `json:"show_latest_posts"`
	ShowShareButton         bool                 `json:"show_share_button"`
	BackgroundColor         string               `json:"background_color"`
	PostTitleColor          *string              `json:"post_title_color"`
	ButtonCorners           string               `json:"button_corners" enum:"square,rounded,pill"`
	ButtonStyle             string               `json:"button_style" enum:"fill,outline"`
	ButtonColor             *string              `json:"button_color"`
	LinkStyle               string               `json:"link_style" enum:"underline,regular,bold"`
	LinkColor               *string              `json:"link_color"`
	ImageCorners            string               `json:"image_corners" enum:"square,rounded"`
	HeaderBackgroundColor   string               `json:"header_background_color"`
	SectionTitleColor       *string              `json:"section_title_color"`
	DividerColor            *string              `json:"divider_color"`
	CreatedAt               string               `json:"created_at"`
	UpdatedAt               *string              `json:"updated_at"`
	Count                   *NewsletterCountMeta `json:"count,omitempty"`
}

// NewsletterDesignFields contains the common layout/design fields shared by
// newsletter create and update request bodies.
type NewsletterDesignFields struct {
	Description             *string `json:"description,omitempty" maxLength:"2000"`
	FeedbackEnabled         *bool   `json:"feedback_enabled,omitempty"`
	SenderEmail             *string `json:"sender_email,omitempty" maxLength:"191"`
	SenderReplyTo           *string `json:"sender_reply_to,omitempty" maxLength:"191"`
	Status                  *string `json:"status,omitempty" enum:"active,archived"`
	SubscribeOnSignup       *bool   `json:"subscribe_on_signup,omitempty"`
	SortOrder               *int    `json:"sort_order,omitempty"`
	HeaderImage             *string `json:"header_image,omitempty" maxLength:"2000"`
	ShowHeaderIcon          *bool   `json:"show_header_icon,omitempty"`
	ShowHeaderTitle         *bool   `json:"show_header_title,omitempty"`
	ShowHeaderName          *bool   `json:"show_header_name,omitempty"`
	ShowExcerpt             *bool   `json:"show_excerpt,omitempty"`
	TitleFontCategory       *string `json:"title_font_category,omitempty" enum:"serif,sans_serif"`
	TitleAlignment          *string `json:"title_alignment,omitempty" maxLength:"50"`
	TitleFontWeight         *string `json:"title_font_weight,omitempty" enum:"normal,medium,semibold,bold"`
	ShowFeatureImage        *bool   `json:"show_feature_image,omitempty"`
	BodyFontCategory        *string `json:"body_font_category,omitempty" enum:"serif,sans_serif"`
	FooterContent           *string `json:"footer_content,omitempty" maxLength:"1000000000"`
	ShowBadge               *bool   `json:"show_badge,omitempty"`
	ShowPostTitleSection    *bool   `json:"show_post_title_section,omitempty"`
	ShowCommentCTA          *bool   `json:"show_comment_cta,omitempty"`
	ShowSubscriptionDetails *bool   `json:"show_subscription_details,omitempty"`
	ShowLatestPosts         *bool   `json:"show_latest_posts,omitempty"`
	ShowShareButton         *bool   `json:"show_share_button,omitempty"`
	BackgroundColor         *string `json:"background_color,omitempty" maxLength:"50"`
	PostTitleColor          *string `json:"post_title_color,omitempty" maxLength:"50"`
	ButtonCorners           *string `json:"button_corners,omitempty" enum:"square,rounded,pill"`
	ButtonStyle             *string `json:"button_style,omitempty" enum:"fill,outline"`
	ButtonColor             *string `json:"button_color,omitempty" maxLength:"50"`
	LinkStyle               *string `json:"link_style,omitempty" enum:"underline,regular,bold"`
	LinkColor               *string `json:"link_color,omitempty" maxLength:"50"`
	ImageCorners            *string `json:"image_corners,omitempty" enum:"square,rounded"`
	HeaderBackgroundColor   *string `json:"header_background_color,omitempty" maxLength:"50"`
	SectionTitleColor       *string `json:"section_title_color,omitempty" maxLength:"50"`
	DividerColor            *string `json:"divider_color,omitempty" maxLength:"50"`
}

type CreateNewsletterBody struct {
	Name       string `json:"name" minLength:"1" maxLength:"191"`
	SenderName string `json:"sender_name" maxLength:"191"`
	NewsletterDesignFields
}

type CreateNewsletterInput struct {
	Include       []NewsletterInclude `query:"include,omitempty" doc:"Supported values: count.posts, count.members, count.active_members"`
	OptInExisting bool                `query:"opt_in_existing,omitempty" doc:"Subscribe existing members to this newsletter"`
	Body          struct {
		Newsletters []CreateNewsletterBody `json:"newsletters" minItems:"1" maxItems:"1"`
	}
}

type UpdateNewsletterBody struct {
	Name       *string `json:"name,omitempty" maxLength:"191"`
	SenderName *string `json:"sender_name,omitempty" maxLength:"191"`
	NewsletterDesignFields
}

type UpdateNewsletterInput struct {
	IDPathParam
	Include []NewsletterInclude `query:"include,omitempty" doc:"Supported values: count.posts, count.members, count.active_members"`
	Body    struct {
		Newsletters []UpdateNewsletterBody `json:"newsletters" minItems:"1" maxItems:"1"`
	}
}

type ListNewslettersOutput struct {
	Newsletters []NewsletterResource `json:"newsletters"`
	Meta        BrowseMeta           `json:"meta"`
}

type NewsletterOutput struct {
	Newsletters []NewsletterResource `json:"newsletters"`
}

// Content API newsletter types -- returns a limited set of fields.

type ContentNewsletterResource struct {
	ID                string  `json:"id"`
	UUID              string  `json:"uuid"`
	Name              string  `json:"name"`
	Description       *string `json:"description"`
	Slug              string  `json:"slug"`
	SenderEmail       *string `json:"sender_email"`
	SubscribeOnSignup bool    `json:"subscribe_on_signup"`
	Visibility        string  `json:"visibility"`
	SortOrder         int     `json:"sort_order"`
	CreatedAt         string  `json:"created_at"`
	UpdatedAt         *string `json:"updated_at"`
}

type ContentNewsletterBrowseQueryParams struct {
	CommonBrowseQueryParams
}

type ContentNewslettersBrowseInput struct {
	ContentNewsletterBrowseQueryParams
}

type ListContentNewslettersOutput struct {
	Newsletters []ContentNewsletterResource `json:"newsletters"`
	Meta        BrowseMeta                  `json:"meta"`
}
