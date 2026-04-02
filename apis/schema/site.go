package schema

type SiteResource struct {
	Title               string  `json:"title"`
	Description         string  `json:"description"`
	Logo                *string `json:"logo"`
	Icon                *string `json:"icon"`
	CoverImage          *string `json:"cover_image"`
	AccentColor         *string `json:"accent_color"`
	Locale              *string `json:"locale"`
	URL                 string  `json:"url"`
	Version             string  `json:"version"`
	AllowExternalSignup *bool   `json:"allow_external_signup,omitempty"`
	SentryDSN           *string `json:"sentry_dsn,omitempty"`
	SentryEnv           *string `json:"sentry_env,omitempty"`
	SiteUUID            *string `json:"site_uuid,omitempty"`
}

type GetSiteOutput struct {
	Site SiteResource `json:"site"`
}
