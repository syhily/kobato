package schema

import "github.com/danielgtaylor/huma/v2"

type MemberNewsletterResource struct {
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	Description *string `json:"description"`
	Status      string  `json:"status"`
}

type MemberAttributionResource struct {
	ID             *string `json:"id"`
	Type           *string `json:"type"`
	URL            *string `json:"url"`
	Title          *string `json:"title"`
	ReferrerSource *string `json:"referrer_source"`
	ReferrerMedium *string `json:"referrer_medium"`
	ReferrerURL    *string `json:"referrer_url"`
}

type MemberCommentingResource struct {
	Disabled       bool    `json:"disabled"`
	DisabledReason *string `json:"disabled_reason"`
	DisabledUntil  *string `json:"disabled_until"`
}

type CommentBanInput struct {
	Reason    string  `json:"reason" minLength:"1" maxLength:"2000"`
	ExpiresAt *string `json:"expires_at,omitempty"`
}

type MemberEmailRecipientResource struct {
	ID          string         `json:"id"`
	EmailID     string         `json:"email_id"`
	BatchID     string         `json:"batch_id"`
	ProcessedAt *string        `json:"processed_at"`
	DeliveredAt *string        `json:"delivered_at"`
	OpenedAt    *string        `json:"opened_at"`
	FailedAt    *string        `json:"failed_at"`
	MemberUUID  string         `json:"member_uuid"`
	MemberEmail string         `json:"member_email"`
	MemberName  *string        `json:"member_name"`
	Email       *EmailResource `json:"email"`
}

type MemberSubscriptionCustomerResource struct {
	ID    string  `json:"id"`
	Name  *string `json:"name"`
	Email string  `json:"email"`
}

type MemberSubscriptionPriceResource struct {
	ID       string        `json:"id"`
	PriceID  *string       `json:"price_id"`
	Nickname *string       `json:"nickname"`
	Amount   *int          `json:"amount"`
	Interval *string       `json:"interval"`
	Type     *string       `json:"type"`
	Currency *string       `json:"currency"`
	Tier     *TierResource `json:"tier"`
}

type MemberSubscriptionResource struct {
	ID                      string                              `json:"id"`
	Status                  string                              `json:"status"`
	StartDate               *string                             `json:"start_date"`
	DefaultPaymentCardLast4 *string                             `json:"default_payment_card_last4"`
	CancelAtPeriodEnd       *bool                               `json:"cancel_at_period_end"`
	CancellationReason      *string                             `json:"cancellation_reason"`
	CurrentPeriodEnd        *string                             `json:"current_period_end"`
	Customer                *MemberSubscriptionCustomerResource `json:"customer"`
	Price                   *MemberSubscriptionPriceResource    `json:"price"`
	Attribution             *MemberAttributionResource          `json:"attribution,omitempty"`
}

type EmailSuppressionInfo struct {
	Suppressed bool    `json:"suppressed"`
	Info       *string `json:"info"`
}

type MemberResource struct {
	ID               string                         `json:"id"`
	UUID             string                         `json:"uuid"`
	Email            string                         `json:"email"`
	Name             *string                        `json:"name"`
	Note             *string                        `json:"note"`
	Geolocation      *string                        `json:"geolocation"`
	Subscribed       bool                           `json:"subscribed"`
	Comped           bool                           `json:"comped"`
	CreatedAt        string                         `json:"created_at"`
	UpdatedAt        *string                        `json:"updated_at"`
	Labels           []MemberLabelResource          `json:"labels"`
	Subscriptions    []MemberSubscriptionResource   `json:"subscriptions"`
	AvatarImage      string                         `json:"avatar_image"`
	EmailCount       int                            `json:"email_count"`
	EmailOpenedCount int                            `json:"email_opened_count"`
	EmailOpenRate    *float64                       `json:"email_open_rate"`
	EmailRecipients  []MemberEmailRecipientResource `json:"email_recipients,omitempty"`
	Status           string                         `json:"status"`
	LastSeenAt       *string                        `json:"last_seen_at"`
	Attribution      *MemberAttributionResource     `json:"attribution,omitempty"`
	UnsubscribeURL   *string                        `json:"unsubscribe_url,omitempty"`
	CanComment       *bool                          `json:"can_comment,omitempty"`
	Commenting       *MemberCommentingResource      `json:"commenting,omitempty"`
	EmailSuppression *EmailSuppressionInfo          `json:"email_suppression"`
	Newsletters      []MemberNewsletterResource     `json:"newsletters,omitempty"`
	Tiers            []TierResource                 `json:"tiers,omitempty"`
}

type CreateMemberBody struct {
	Email            string           `json:"email" minLength:"1" maxLength:"191" pattern:"^([^,]|$)"`
	Name             *string          `json:"name,omitempty" maxLength:"191" pattern:"^([^,]|$)"`
	Note             *string          `json:"note,omitempty" maxLength:"2000"`
	Labels           []SlugRef        `json:"labels,omitempty"`
	Products         []SlugRef        `json:"products,omitempty"`
	Tiers            []SlugRef        `json:"tiers,omitempty"`
	Newsletters      []SlugRef        `json:"newsletters,omitempty"`
	Subscribed       *bool            `json:"subscribed,omitempty"`
	Comped           *bool            `json:"comped,omitempty"`
	StripeCustomerID *string          `json:"stripe_customer_id,omitempty"`
	CanComment       *bool            `json:"can_comment,omitempty"`
	CommentBan       *CommentBanInput `json:"comment_ban,omitempty"`
}

type CreateMemberInput struct {
	SendEmail bool   `query:"send_email,omitempty" doc:"Send a welcome email to the new member"`
	EmailType string `query:"email_type,omitempty" doc:"Type of email to send" enum:"signin,signup,subscribe"`
	Body      struct {
		Members []CreateMemberBody `json:"members" minItems:"1" maxItems:"1"`
	}
}

type UpdateMemberBody struct {
	Email       *string          `json:"email,omitempty" maxLength:"191" pattern:"^([^,]|$)"`
	Name        *string          `json:"name,omitempty" maxLength:"191" pattern:"^([^,]|$)"`
	Note        *string          `json:"note,omitempty" maxLength:"2000"`
	Labels      []SlugRef        `json:"labels,omitempty"`
	Products    []SlugRef        `json:"products,omitempty"`
	Tiers       []SlugRef        `json:"tiers,omitempty"`
	Newsletters []SlugRef        `json:"newsletters,omitempty"`
	Subscribed  *bool            `json:"subscribed,omitempty"`
	Comped      *bool            `json:"comped,omitempty"`
	CanComment  *bool            `json:"can_comment,omitempty"`
	CommentBan  *CommentBanInput `json:"comment_ban,omitempty"`
}

type UpdateMemberInput struct {
	IDPathParam
	Body struct {
		Members []UpdateMemberBody `json:"members" minItems:"1" maxItems:"1"`
	}
}

type DeleteMemberInput struct {
	IDPathParam
	Cancel bool `query:"cancel,omitempty"`
}

type ListMembersOutput struct {
	Members []MemberResource `json:"members"`
	Meta    BrowseMeta       `json:"meta"`
}

type MemberOutput struct {
	Members []MemberResource `json:"members"`
}

// Admin member operation types

type AdminMemberEventsBrowseInput struct {
	Limit  string `query:"limit,omitempty"`
	Filter string `query:"filter,omitempty"`
}

type AdminMemberEventsOutput struct {
	Events []AdminMemberEventResource `json:"events"`
	Meta   BrowseMeta                 `json:"meta"`
}

type AdminMemberEventResource struct {
	ID        string `json:"id"`
	Type      string `json:"type"`
	CreatedAt string `json:"created_at"`
}

type AdminMemberCSVInput struct {
	Limit  string `query:"limit,omitempty"`
	Filter string `query:"filter,omitempty"`
	Search string `query:"search,omitempty"`
}

type AdminMemberCSVImportFormData struct {
	MembersFile huma.FormFile `form:"membersfile" required:"true"`
	Mapping     string        `form:"mapping,omitempty"`
	Labels      string        `form:"labels,omitempty"`
}

type AdminMemberCSVImportInput struct {
	RawBody huma.MultipartFormFiles[AdminMemberCSVImportFormData]
}

type AdminCreateMemberSubscriptionInput struct {
	IDPathParam
	Body struct {
		StripePriceID string `json:"stripe_price_id"`
	}
}

type MemberSubscriptionIDPathParam struct {
	ID             string `path:"id" maxLength:"24"`
	SubscriptionID string `path:"subscription_id" maxLength:"191"`
}

type AdminUpdateMemberSubscriptionInput struct {
	MemberSubscriptionIDPathParam
	Body struct {
		CancelAtPeriodEnd bool    `json:"cancel_at_period_end"`
		Status            *string `json:"status,omitempty"`
	}
}

type AdminMemberSigninURLOutput struct {
	MemberID string `json:"member_id"`
	URL      string `json:"url"`
}

type AdminMemberCommentingToggleInput struct {
	IDPathParam
	Body struct {
		Reason       *string `json:"reason,omitempty"`
		ExpiresAt    *string `json:"expires_at,omitempty"`
		HideComments *bool   `json:"hide_comments,omitempty"`
	}
}
