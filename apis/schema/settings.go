package schema

import "encoding/json"

type GetSettingsInput struct{}

type AdminSettingsBrowseInput struct {
	Group string `query:"group,omitempty" doc:"Comma-separated settings groups to return"`
}

type SettingsNavigationItem struct {
	Label string `json:"label"`
	URL   string `json:"url"`
}

type SiteSettings struct {
	Title               string                   `json:"title"`
	Description         string                   `json:"description"`
	Logo                *string                  `json:"logo"`
	Icon                *string                  `json:"icon"`
	AccentColor         *string                  `json:"accent_color"`
	CoverImage          *string                  `json:"cover_image"`
	Facebook            *string                  `json:"facebook"`
	Twitter             *string                  `json:"twitter"`
	Lang                *string                  `json:"lang,omitempty"`
	Locale              *string                  `json:"locale,omitempty"`
	Timezone            string                   `json:"timezone"`
	CodeinjectionHead   *string                  `json:"codeinjection_head"`
	CodeinjectionFoot   *string                  `json:"codeinjection_foot"`
	Navigation          []SettingsNavigationItem `json:"navigation"`
	SecondaryNavigation []SettingsNavigationItem `json:"secondary_navigation"`

	MetaTitle       *string `json:"meta_title"`
	MetaDescription *string `json:"meta_description"`

	OgImage                      *string         `json:"og_image"`
	OgTitle                      *string         `json:"og_title"`
	OgDescription                *string         `json:"og_description"`
	TwitterImage                 *string         `json:"twitter_image"`
	TwitterTitle                 *string         `json:"twitter_title"`
	TwitterDescription           *string         `json:"twitter_description"`
	MembersSupportAddress        string          `json:"members_support_address"`
	URL                          string          `json:"url"`
	Version                      string          `json:"version"`
	Labs                         map[string]bool `json:"labs"`
	MembersEnabled               *bool           `json:"members_enabled,omitempty"`
	DonationsEnabled             *bool           `json:"donations_enabled,omitempty"`
	AllowSelfSignup              *bool           `json:"allow_self_signup,omitempty"`
	MembersInviteOnly            *bool           `json:"members_invite_only,omitempty"`
	MembersSignupAccess          *string         `json:"members_signup_access,omitempty"`
	PaidMembersEnabled           *bool           `json:"paid_members_enabled,omitempty"`
	FirstPromoterAccount         *string         `json:"firstpromoter_account,omitempty"`
	PortalButtonStyle            *string         `json:"portal_button_style,omitempty"`
	PortalButtonSignupText       *string         `json:"portal_button_signup_text,omitempty"`
	PortalButtonIcon             *string         `json:"portal_button_icon,omitempty"`
	PortalSignupTermsHTML        *string         `json:"portal_signup_terms_html,omitempty"`
	PortalSignupCheckboxRequired *bool           `json:"portal_signup_checkbox_required,omitempty"`
	PortalPlans                  []string        `json:"portal_plans,omitempty"`
	PortalDefaultPlan            *string         `json:"portal_default_plan,omitempty"`
	PortalName                   *string         `json:"portal_name,omitempty"`
	PortalButton                 *bool           `json:"portal_button,omitempty"`
	CommentsEnabled              *bool           `json:"comments_enabled,omitempty"`
	RecommendationsEnabled       *bool           `json:"recommendations_enabled,omitempty"`
	OutboundLinkTagging          *bool           `json:"outbound_link_tagging,omitempty"`
	DefaultEmailAddress          *string         `json:"default_email_address,omitempty"`
	SupportEmailAddress          *string         `json:"support_email_address,omitempty"`
	EditorDefaultEmailRecipients *string         `json:"editor_default_email_recipients,omitempty"`
	TransistorPortalEnabled      *bool           `json:"transistor_portal_enabled,omitempty"`
	TransistorPortalHeading      *string         `json:"transistor_portal_heading,omitempty"`
	TransistorPortalDescription  *string         `json:"transistor_portal_description,omitempty"`
	TransistorPortalButtonText   *string         `json:"transistor_portal_button_text,omitempty"`
	TransistorPortalURLTemplate  *string         `json:"transistor_portal_url_template,omitempty"`
	SiteUUID                     *string         `json:"site_uuid,omitempty"`
}

type SettingsOutputMeta struct {
	CacheableKey   *string `json:"cacheableKey,omitempty"`
	CacheableValue *string `json:"cacheableValue,omitempty"`
}

type GetSettingsOutput struct {
	Settings SiteSettings        `json:"settings"`
	Meta     *SettingsOutputMeta `json:"meta,omitempty"`
}

// Admin settings types -- the admin API returns a flat key-value array.

type AdminSettingResource struct {
	Key string `json:"key"`
	// Value is the setting value. Type depends on key:
	//   string settings: JSON string (e.g., "title", "description")
	//   boolean settings: JSON boolean (e.g., "members_enabled")
	//   JSON settings: JSON object/array (e.g., "navigation", "labs")
	Value      json.RawMessage `json:"value"`
	IsReadOnly *bool           `json:"is_read_only,omitempty"`
}

type AdminSettingsFilters struct {
	Group string `json:"group"`
}

type AdminSettingsMeta struct {
	Filters *AdminSettingsFilters `json:"filters,omitempty"`
}

type AdminGetSettingsOutput struct {
	Settings []AdminSettingResource `json:"settings"`
	Meta     AdminSettingsMeta      `json:"meta"`
}

type AdminEditSettingsInput struct {
	Body struct {
		Settings []AdminSettingResource `json:"settings"`
	}
}
