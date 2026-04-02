package schema

type RoleResource struct {
	ID          string               `json:"id"`
	Name        string               `json:"name"`
	Description string               `json:"description"`
	CreatedAt   *string              `json:"created_at"`
	UpdatedAt   *string              `json:"updated_at"`
	Permissions []PermissionResource `json:"permissions,omitempty"`
}

type PermissionResource struct {
	ID         string  `json:"id"`
	Name       string  `json:"name"`
	ObjectType string  `json:"object_type"`
	ActionType string  `json:"action_type"`
	ObjectID   *string `json:"object_id"`
	CreatedAt  *string `json:"created_at"`
	UpdatedAt  *string `json:"updated_at"`
}

type UserResource struct {
	ID              string         `json:"id"`
	Slug            string         `json:"slug"`
	Name            string         `json:"name"`
	ProfileImage    *string        `json:"profile_image"`
	CoverImage      *string        `json:"cover_image"`
	Bio             *string        `json:"bio"`
	Website         *string        `json:"website"`
	Location        *string        `json:"location"`
	Facebook        *string        `json:"facebook"`
	Twitter         *string        `json:"twitter"`
	Threads         *string        `json:"threads,omitempty"`
	Bluesky         *string        `json:"bluesky,omitempty"`
	Mastodon        *string        `json:"mastodon,omitempty"`
	Tiktok          *string        `json:"tiktok,omitempty"`
	Youtube         *string        `json:"youtube,omitempty"`
	Instagram       *string        `json:"instagram,omitempty"`
	Linkedin        *string        `json:"linkedin,omitempty"`
	MetaTitle       *string        `json:"meta_title"`
	MetaDescription *string        `json:"meta_description"`
	URL             *string        `json:"url"`
	Count           *PostCountMeta `json:"count,omitempty"`

	Email                                *string              `json:"email"`
	Accessibility                        *string              `json:"accessibility"`
	Status                               string               `json:"status"`
	CreatedAt                            *string              `json:"created_at"`
	UpdatedAt                            *string              `json:"updated_at"`
	LastSeen                             *string              `json:"last_seen"`
	Tour                                 *string              `json:"tour"`
	CommentNotifications                 bool                 `json:"comment_notifications"`
	FreeMemberSignupNotification         bool                 `json:"free_member_signup_notification"`
	PaidSubscriptionStartedNotification  bool                 `json:"paid_subscription_started_notification"`
	PaidSubscriptionCanceledNotification bool                 `json:"paid_subscription_canceled_notification"`
	MentionNotifications                 *bool                `json:"mention_notifications"`
	MilestoneNotifications               *bool                `json:"milestone_notifications"`
	RecommendationNotifications          *bool                `json:"recommendation_notifications"`
	DonationNotifications                *bool                `json:"donation_notifications"`
	Permissions                          []PermissionResource `json:"permissions,omitempty"`
	Roles                                []RoleResource       `json:"roles,omitempty"`
}

type ListUsersOutput struct {
	Users []UserResource `json:"users"`
	Meta  BrowseMeta     `json:"meta"`
}

type UserOutput struct {
	Users []UserResource `json:"users"`
}

type UpdateUserBody struct {
	Name                                 *string `json:"name,omitempty" maxLength:"191"`
	Slug                                 *string `json:"slug,omitempty" maxLength:"191"`
	Email                                *string `json:"email,omitempty" maxLength:"191"`
	ProfileImage                         *string `json:"profile_image,omitempty" maxLength:"2000"`
	CoverImage                           *string `json:"cover_image,omitempty" maxLength:"2000"`
	Bio                                  *string `json:"bio,omitempty" maxLength:"200"`
	Website                              *string `json:"website,omitempty" maxLength:"2000"`
	Location                             *string `json:"location,omitempty" maxLength:"150"`
	Facebook                             *string `json:"facebook,omitempty" maxLength:"2000"`
	Twitter                              *string `json:"twitter,omitempty" maxLength:"2000"`
	Threads                              *string `json:"threads,omitempty" maxLength:"2000"`
	Bluesky                              *string `json:"bluesky,omitempty" maxLength:"2000"`
	Mastodon                             *string `json:"mastodon,omitempty" maxLength:"2000"`
	Tiktok                               *string `json:"tiktok,omitempty" maxLength:"2000"`
	Youtube                              *string `json:"youtube,omitempty" maxLength:"2000"`
	Instagram                            *string `json:"instagram,omitempty" maxLength:"2000"`
	Linkedin                             *string `json:"linkedin,omitempty" maxLength:"2000"`
	MetaTitle                            *string `json:"meta_title,omitempty" maxLength:"300"`
	MetaDescription                      *string `json:"meta_description,omitempty" maxLength:"500"`
	Accessibility                        *string `json:"accessibility,omitempty" maxLength:"65535"`
	CommentNotifications                 *bool   `json:"comment_notifications,omitempty"`
	FreeMemberSignupNotification         *bool   `json:"free_member_signup_notification,omitempty"`
	PaidSubscriptionStartedNotification  *bool   `json:"paid_subscription_started_notification,omitempty"`
	PaidSubscriptionCanceledNotification *bool   `json:"paid_subscription_canceled_notification,omitempty"`
	MentionNotifications                 *bool   `json:"mention_notifications,omitempty"`
	MilestoneNotifications               *bool   `json:"milestone_notifications,omitempty"`
	RecommendationNotifications          *bool   `json:"recommendation_notifications,omitempty"`
	DonationNotifications                *bool   `json:"donation_notifications,omitempty"`
}

type UpdateUserInput struct {
	IDPathParam
	Include []UserInclude `query:"include,omitempty" doc:"Supported values: count.posts, permissions, roles, roles.permissions"`
	Body    struct {
		Users []UpdateUserBody `json:"users" minItems:"1" maxItems:"1"`
	}
}

type RolesBrowseInput struct {
	Permissions string `query:"permissions,omitempty" doc:"Filter roles by permission type" enum:"assign"`
}

type ListRolesOutput struct {
	Roles []RoleResource `json:"roles"`
}

type CreateInviteBody struct {
	RoleID string `json:"role_id" maxLength:"24"`
	Email  string `json:"email" minLength:"1" maxLength:"191"`
}

type CreateInviteInput struct {
	Body struct {
		Invites []CreateInviteBody `json:"invites" minItems:"1" maxItems:"1"`
	}
}

type InviteResource struct {
	ID        string  `json:"id"`
	RoleID    string  `json:"role_id"`
	Email     string  `json:"email"`
	Status    string  `json:"status"`
	CreatedAt string  `json:"created_at"`
	UpdatedAt *string `json:"updated_at"`
}

type CreateInviteOutput struct {
	Invites []InviteResource `json:"invites"`
}

type ListInvitesOutput struct {
	Invites []InviteResource `json:"invites"`
	Meta    BrowseMeta       `json:"meta"`
}

type InviteOutput struct {
	Invites []InviteResource `json:"invites"`
}

type AdminUserTokenResource struct {
	ID     string `json:"id"`
	Secret string `json:"secret"`
}

type AdminUserTokenOutput struct {
	APIKey AdminUserTokenResource `json:"apiKey"`
}

type AdminUserPasswordMessage struct {
	Message string `json:"message"`
}

type AdminPasswordBody struct {
	NewPassword string `json:"newPassword"`
	Ne2Password string `json:"ne2Password"`
	UserID      string `json:"user_id"`
}

type AdminUserChangePasswordInput struct {
	Body struct {
		Password []AdminPasswordBody `json:"password"`
	}
}

type AdminUserPasswordOutput struct {
	Password []AdminUserPasswordMessage `json:"password"`
}

type AdminOwnerBody struct {
	Owner []AdminOwnerTransferItem `json:"owner"`
}

type AdminOwnerTransferItem struct {
	UserID string `json:"user_id"`
}

type AdminTransferOwnershipInput struct {
	Body AdminOwnerBody
}

type AdminTransferOwnershipOutput struct {
	Users []UserResource `json:"users"`
}
