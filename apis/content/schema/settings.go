package schema

// Get site settings input
type GetSettingsInput struct{}

// Settings navigation item
type SettingsNavigationItem struct {
	Label string `json:"label"`
	URL   string `json:"url"`
}

// Site settings
type SiteSettings struct {
	Title               string                   `json:"title"`
	Description         string                   `json:"description"`
	Logo                *string                  `json:"logo"`
	Icon                *string                  `json:"icon"`
	AccentColor         *string                  `json:"accent_color"`
	CoverImage          *string                  `json:"cover_image"`
	Facebook            *string                  `json:"facebook"`
	Twitter             *string                  `json:"twitter"`
	Lang                string                   `json:"lang"`
	Timezone            string                   `json:"timezone"`
	CodeinjectionHead   *string                  `json:"codeinjection_head"`
	CodeinjectionFoot   *string                  `json:"codeinjection_foot"`
	Navigation          []SettingsNavigationItem `json:"navigation"`
	SecondaryNavigation []SettingsNavigationItem `json:"secondary_navigation"`

	MetaTitle       *string `json:"meta_title"`
	MetaDescription *string `json:"meta_description"`

	OgImage            *string `json:"og_image"`
	OgTitle            *string `json:"og_title"`
	OgDescription      *string `json:"og_description"`
	TwitterImage       *string `json:"twitter_image"`
	TwitterTitle       *string `json:"twitter_title"`
	TwitterDescription *string `json:"twitter_description"`
	SiteEmailAddress   string  `json:"site_email_address"`
	URL                string  `json:"url"`
}

// Get site settings output
type GetSettingsOutput struct {
	Settings SiteSettings `json:"settings"`
}
