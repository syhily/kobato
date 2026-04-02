package schema

import (
	"encoding/json"

	"github.com/danielgtaylor/huma/v2"
)

type AdminCSVExportOutput struct {
	ContentType        string `header:"Content-Type"`
	ContentDisposition string `header:"Content-Disposition"`
	Body               []byte
}

type AdminBulkStats struct {
	Successful   int `json:"successful"`
	Unsuccessful int `json:"unsuccessful"`
}

type AdminBulkMeta struct {
	Stats            *AdminBulkStats `json:"stats,omitempty"`
	Errors           []string        `json:"errors,omitempty"`
	UnsuccessfulData []string        `json:"unsuccessfulData,omitempty"`
}

type AdminBulkActionOutput struct {
	Bulk struct {
		Action *string        `json:"action,omitempty"`
		Meta   *AdminBulkMeta `json:"meta,omitempty"`
	} `json:"bulk"`
}

type AdminMemberBulkDestroyMeta struct {
	Stats           *AdminBulkStats `json:"stats,omitempty"`
	Errors          []string        `json:"errors,omitempty"`
	UnsuccessfulIDs []string        `json:"unsuccessfulIds,omitempty"`
}

type AdminMemberBulkDestroyOutput struct {
	Meta *AdminMemberBulkDestroyMeta `json:"meta,omitempty"`
}

type AdminPostExportInput struct {
	Limit  string `query:"limit,omitempty"`
	Filter string `query:"filter,omitempty"`
	Order  string `query:"order,omitempty"`
}

type AdminPostBulkDeleteInput struct {
	Filter string `query:"filter,omitempty"`
}

type BulkEditMeta struct {
	Tags       []SlugRef `json:"tags,omitempty"`
	Labels     []SlugRef `json:"labels,omitempty"`
	Newsletter *SlugRef  `json:"newsletter,omitempty"`
}

type AdminBulkActionBody struct {
	Action string        `json:"action"`
	Meta   *BulkEditMeta `json:"meta,omitempty"`
}

type AdminPostBulkEditInput struct {
	Filter string `query:"filter,omitempty"`
	Body   struct {
		Bulk AdminBulkActionBody `json:"bulk"`
	}
}

type AdminPageBulkDeleteInput struct {
	Filter string `query:"filter,omitempty"`
}

type AdminPageBulkEditInput struct {
	Filter string `query:"filter,omitempty"`
	Body   struct {
		Bulk AdminBulkActionBody `json:"bulk"`
	}
}

type AdminMemberBulkDeleteInput struct {
	All    *bool  `query:"all,omitempty"`
	Filter string `query:"filter,omitempty"`
	Search string `query:"search,omitempty"`
}

type AdminMemberBulkEditInput struct {
	All    *bool  `query:"all,omitempty"`
	Filter string `query:"filter,omitempty"`
	Search string `query:"search,omitempty"`
	Body   struct {
		Bulk AdminBulkActionBody `json:"bulk"`
	}
}

type MemberCountDataPoint struct {
	Date   string `json:"date"`
	Paid   int    `json:"paid"`
	Free   int    `json:"free"`
	Comped int    `json:"comped"`
}

type MemberCountStatsOutput struct {
	Resource string                 `json:"resource"`
	Total    int                    `json:"total,omitempty"`
	Data     []MemberCountDataPoint `json:"data,omitempty"`
}

type MemberMRRCurrencyData struct {
	Date  string `json:"date"`
	Value int    `json:"value"`
}

type MemberMRREntry struct {
	Currency string                  `json:"currency"`
	Data     []MemberMRRCurrencyData `json:"data"`
}

type MemberMRRStatsOutput struct {
	Resource string           `json:"resource"`
	Data     []MemberMRREntry `json:"data,omitempty"`
}

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

type AdminRoutesYAMLOutput struct {
	ContentType        string `header:"Content-Type"`
	ContentDisposition string `header:"Content-Disposition"`
	Body               []byte
}

type AdminRoutesYAMLUploadFormData struct {
	Routes huma.FormFile `form:"routes" required:"true"`
}

type AdminRoutesYAMLUploadInput struct {
	RawBody huma.MultipartFormFiles[AdminRoutesYAMLUploadFormData]
}

type AdminSettingsVerificationInput struct {
	Body struct {
		Token string `json:"token"`
	}
}

type AdminSettingsVerificationOutput struct{}

type AdminNewsletterVerificationInput struct {
	Body struct {
		Token string `json:"token"`
	}
}

type AdminNewsletterVerificationOutput struct{}

type AdminNoContentOutput struct{}

type StatsDateFromParams struct {
	DateFrom *string `query:"date_from,omitempty" doc:"Start date for stats range (ISO 8601)"`
}

type StatsDateRangeParams struct {
	DateFrom *string `query:"date_from,omitempty" doc:"Start date for stats range (ISO 8601)"`
	DateTo   *string `query:"date_to,omitempty" doc:"End date for stats range (ISO 8601)"`
}

type StatsCommonRangeParams struct {
	Order    *string `query:"order,omitempty" doc:"Order expression"`
	Limit    *string `query:"limit,omitempty" doc:"Number of results to return"`
	DateFrom *string `query:"date_from,omitempty" doc:"Start date (ISO 8601)"`
	DateTo   *string `query:"date_to,omitempty" doc:"End date (ISO 8601)"`
	Timezone *string `query:"timezone,omitempty" doc:"Timezone for date calculations"`
}

type StatsMemberCountInput struct {
	StatsDateFromParams
}

type StatsMRRInput struct {
	StatsDateFromParams
}

type StatsSubscriptionsInput struct{}

type StatsReferrersInput struct{}

type StatsTopContentInput struct {
	DateFrom     *string `query:"date_from,omitempty" doc:"Start date (ISO 8601)"`
	DateTo       *string `query:"date_to,omitempty" doc:"End date (ISO 8601)"`
	Timezone     *string `query:"timezone,omitempty" doc:"Timezone for date calculations"`
	MemberStatus *string `query:"member_status,omitempty" doc:"Filter by member status"`
	PostType     *string `query:"post_type,omitempty" doc:"Filter by post type"`
	PostUUID     *string `query:"post_uuid,omitempty" doc:"Filter by post UUID"`
	Pathname     *string `query:"pathname,omitempty" doc:"Filter by pathname"`
	Device       *string `query:"device,omitempty" doc:"Filter by device type"`
	Location     *string `query:"location,omitempty" doc:"Filter by location"`
	Source       *string `query:"source,omitempty" doc:"Filter by traffic source"`
	UtmSource    *string `query:"utm_source,omitempty" doc:"Filter by UTM source"`
	UtmMedium    *string `query:"utm_medium,omitempty" doc:"Filter by UTM medium"`
	UtmCampaign  *string `query:"utm_campaign,omitempty" doc:"Filter by UTM campaign"`
	UtmContent   *string `query:"utm_content,omitempty" doc:"Filter by UTM content"`
	UtmTerm      *string `query:"utm_term,omitempty" doc:"Filter by UTM term"`
}

type StatsTopPostsInput struct {
	StatsCommonRangeParams
	PostType *string `query:"post_type,omitempty" doc:"Filter by post type"`
}

type StatsTopPostsViewsInput struct {
	StatsCommonRangeParams
}

type StatsNewsletterStatsInput struct {
	StatsCommonRangeParams
	NewsletterID *string `query:"newsletter_id,omitempty" doc:"Filter by newsletter ID"`
}

type StatsNewsletterClickInput struct {
	NewsletterID *string `query:"newsletter_id,omitempty" doc:"Filter by newsletter ID"`
	PostIDs      *string `query:"post_ids,omitempty" doc:"Comma-separated post IDs"`
}

type StatsSubscriberCountInput struct {
	StatsDateRangeParams
	NewsletterID *string `query:"newsletter_id,omitempty" doc:"Filter by newsletter ID"`
}

type StatsPostReferrersInput struct {
	IDPathParam
	StatsCommonRangeParams
}

type StatsPostGrowthInput struct {
	IDPathParam
}

type StatsPostStatsInput struct {
	IDPathParam
}

type StatsPostsVisitorCountsInput struct {
	Body struct {
		PostUUIDs []string `json:"post_uuids" minItems:"1"`
	}
}

type StatsPostsMemberCountsInput struct {
	Body struct {
		PostIDs []string `json:"post_ids" minItems:"1"`
	}
}

type StatsTopSourcesGrowthInput struct {
	StatsCommonRangeParams
	MemberStatus *string `query:"member_status,omitempty" doc:"Filter by member status"`
}

type EmailsBrowseInput struct {
	CommonBrowseQueryParams
}

type OEmbedReadInput struct {
	URL  string  `query:"url" doc:"URL to fetch oEmbed data for"`
	Type *string `query:"type,omitempty" doc:"Type of oEmbed (e.g., bookmark)"`
}

type MentionsBrowseInput struct {
	CommonBrowseQueryParams
}

type ActionsBrowseInput struct {
	CommonBrowseQueryParams
}

type LinksBrowseInput struct {
	CommonBrowseQueryParams
}

type BulkEditLinkDetail struct {
	From string `json:"from"`
	To   string `json:"to"`
}

type BulkEditLinkMeta struct {
	Link BulkEditLinkDetail `json:"link"`
}

type BulkEditLinksBody struct {
	Action string            `json:"action" enum:"updateLink"`
	Meta   *BulkEditLinkMeta `json:"meta"`
}

type BulkEditLinksInput struct {
	CommonBrowseQueryParams
	Body struct {
		Bulk BulkEditLinksBody `json:"bulk"`
	}
}

type CustomThemeSettingsEditInput struct {
	Body struct {
		CustomThemeSettings []AdminCustomThemeSettingResource `json:"custom_theme_settings"`
	}
}

type MemberStatsQueryParams struct {
	Days *int `query:"days,omitempty" doc:"Number of days to look back"`
}

type MemberCountStatsInput struct {
	MemberStatsQueryParams
}

type MemberMRRStatsInput struct {
	MemberStatsQueryParams
}

type AdminSearchIndexContentResource struct {
	ID          string  `json:"id"`
	UUID        string  `json:"uuid"`
	URL         string  `json:"url"`
	Title       string  `json:"title"`
	Slug        string  `json:"slug"`
	Status      string  `json:"status"`
	PublishedAt *string `json:"published_at"`
	Visibility  string  `json:"visibility"`
}

// Aliases for backward compatibility in output types.
type AdminSearchIndexPostResource = AdminSearchIndexContentResource
type AdminSearchIndexPageResource = AdminSearchIndexContentResource

type AdminSearchIndexTagResource struct {
	ID   string `json:"id"`
	Slug string `json:"slug"`
	Name string `json:"name"`
	URL  string `json:"url"`
}

type AdminSearchIndexUserResource struct {
	ID           string  `json:"id"`
	Slug         string  `json:"slug"`
	Name         string  `json:"name"`
	URL          string  `json:"url"`
	ProfileImage *string `json:"profile_image"`
}

type AdminSearchIndexPostsOutput struct {
	Posts []AdminSearchIndexPostResource `json:"posts"`
}

type AdminSearchIndexPagesOutput struct {
	Pages []AdminSearchIndexPageResource `json:"pages"`
}

type AdminSearchIndexTagsOutput struct {
	Tags []AdminSearchIndexTagResource `json:"tags"`
}

type AdminSearchIndexUsersOutput struct {
	Users []AdminSearchIndexUserResource `json:"users"`
}

type AdminConfigResource struct {
	Version                    string          `json:"version"`
	Environment                string          `json:"environment"`
	Database                   string          `json:"database"`
	Mail                       string          `json:"mail"`
	UseGravatar                bool            `json:"useGravatar"`
	Labs                       map[string]bool `json:"labs"`
	ClientExtensions           map[string]bool `json:"clientExtensions"`
	EnableDeveloperExperiments bool            `json:"enableDeveloperExperiments"`
	StripeDirect               bool            `json:"stripeDirect"`
	MailgunIsConfigured        bool            `json:"mailgunIsConfigured"`
	EmailAnalytics             bool            `json:"emailAnalytics"`
	Security                   struct {
		StaffDeviceVerification bool `json:"staffDeviceVerification"`
	} `json:"security"`
}

type AdminConfigOutput struct {
	Config AdminConfigResource `json:"config"`
}

type AdminFeaturebaseTokenOutput struct {
	Featurebase struct {
		Token string `json:"token"`
	} `json:"featurebase"`
}

type AdminTinybirdTokenOutput struct {
	Tinybird struct {
		Token string `json:"token"`
	} `json:"tinybird"`
}

type AdminExploreOutput struct {
	Explore struct {
		URL string `json:"url"`
	} `json:"explore"`
}

type SlugEntry struct {
	Slug string `json:"slug"`
}

type AdminSlugsOutput struct {
	Slugs []SlugEntry `json:"slugs"`
}

type AdminActionsOutput struct {
	Actions []AdminActionResource `json:"actions"`
	Meta    BrowseMeta            `json:"meta"`
}

type ActionActorResource struct {
	ID           string  `json:"id"`
	Name         string  `json:"name"`
	Slug         string  `json:"slug"`
	Image        *string `json:"image"`
	ProfileImage *string `json:"profile_image,omitempty"`
}

type ActionResourceObject struct {
	ID    string  `json:"id"`
	Title *string `json:"title,omitempty"`
	Slug  *string `json:"slug,omitempty"`
}

type AdminActionResource struct {
	ID           string                `json:"id"`
	ResourceID   string                `json:"resource_id"`
	ResourceType string                `json:"resource_type"`
	ActorID      string                `json:"actor_id"`
	ActorType    string                `json:"actor_type"`
	Event        string                `json:"event"`
	Context      json.RawMessage       `json:"context"`
	CreatedAt    string                `json:"created_at"`
	Actor        *ActionActorResource  `json:"actor,omitempty"`
	Resource     *ActionResourceObject `json:"resource,omitempty"`
}

type AdminMentionsOutput struct {
	Mentions []AdminMentionResource `json:"mentions"`
	Meta     BrowseMeta             `json:"meta"`
}

type AdminMentionResource struct {
	ID   string `json:"id"`
	URL  string `json:"url"`
	Type string `json:"type"`
}

type AdminLinksOutput struct {
	Links []AdminLinkResource `json:"links"`
	Meta  BrowseMeta          `json:"meta"`
}

type AdminLinkResource struct {
	PostID string `json:"post_id"`
	Link   struct {
		LinkID string `json:"link_id"`
		From   string `json:"from"`
		To     string `json:"to"`
		Edited bool   `json:"edited"`
	} `json:"link"`
	Count struct {
		Clicks int `json:"clicks"`
	} `json:"count"`
}

type AdminRedirectUploadOutput struct {
	Redirects []string `json:"redirects"`
}

type MediaUploadResource struct {
	URL          string  `json:"url"`
	ThumbnailURL *string `json:"thumbnail_url,omitempty"`
	Ref          *string `json:"ref"`
}

type AdminMediaUploadOutput struct {
	Media []MediaUploadResource `json:"media"`
}

type FileUploadResource struct {
	URL string  `json:"url"`
	Ref *string `json:"ref"`
}

type AdminFilesUploadOutput struct {
	Files []FileUploadResource `json:"files"`
}

// AdminOEmbedOutput wraps oEmbed responses. Metadata follows oEmbed spec with
// fields like: {"type":"rich","version":"1.0","title":"...","html":"<iframe...>","width":N,"height":N}
type AdminOEmbedOutput struct {
	Metadata json.RawMessage `json:"metadata,omitempty"`
}

type AdminSlackTestOutput struct {
	Ok bool `json:"ok"`
}

type AdminEmailBatchesOutput struct {
	Batches []AdminEmailBatchResource `json:"batches"`
	Meta    BrowseMeta                `json:"meta"`
}

type AdminEmailBatchResource struct {
	ID              string  `json:"id"`
	ProviderID      string  `json:"provider_id"`
	Status          string  `json:"status"`
	MemberSegment   string  `json:"member_segment"`
	CreatedAt       string  `json:"created_at"`
	UpdatedAt       string  `json:"updated_at"`
	ErrorStatusCode *string `json:"error_status_code"`
	ErrorMessage    *string `json:"error_message"`
	// ErrorData contains provider-specific error details (varies by email provider)
	ErrorData json.RawMessage `json:"error_data"`
	Count     struct {
		Recipients int `json:"recipients"`
	} `json:"count"`
}

type AdminEmailFailuresOutput struct {
	Failures []AdminEmailFailureResource `json:"failures"`
	Meta     BrowseMeta                  `json:"meta"`
}

type EmailFailureMemberResource struct {
	ID    string  `json:"id"`
	UUID  string  `json:"uuid"`
	Email string  `json:"email"`
	Name  *string `json:"name"`
}

type AdminEmailFailureResource struct {
	ID           string                      `json:"id"`
	Code         string                      `json:"code"`
	EnhancedCode *string                     `json:"enhanced_code"`
	Message      string                      `json:"message"`
	Severity     string                      `json:"severity"`
	FailedAt     string                      `json:"failed_at"`
	EventID      string                      `json:"event_id"`
	Member       *EmailFailureMemberResource `json:"member,omitempty"`
}

type AdminEmailAnalyticsStatusOutput struct {
	Status string `json:"status"`
}

type AdminEmailsOutput struct {
	Emails []EmailResource `json:"emails"`
	Meta   BrowseMeta      `json:"meta"`
}

type AdminEmailOutput struct {
	Emails []EmailResource `json:"emails"`
}

type AdminRecommendationsOutput struct {
	Recommendations []AdminRecommendationResource `json:"recommendations"`
	Meta            BrowseMeta                    `json:"meta"`
}

type AdminRecommendationOutput struct {
	Recommendations []AdminRecommendationResource `json:"recommendations"`
}

type RecommendationCountMeta struct {
	ClickCount      int `json:"clicks"`
	SubscriberCount int `json:"subscribers"`
}

type AdminRecommendationResource struct {
	BaseRecommendationResource
	Count *RecommendationCountMeta `json:"count,omitempty"`
}

type CreateRecommendationBody struct {
	URL               string  `json:"url"`
	Title             *string `json:"title,omitempty"`
	Description       *string `json:"description,omitempty"`
	Excerpt           *string `json:"excerpt,omitempty"`
	FeaturedImage     *string `json:"featured_image,omitempty"`
	Favicon           *string `json:"favicon,omitempty"`
	OneClickSubscribe *bool   `json:"one_click_subscribe,omitempty"`
}

type CreateRecommendationInput struct {
	Body struct {
		Recommendations []CreateRecommendationBody `json:"recommendations"`
	}
}

type UpdateRecommendationBody struct {
	Title             *string `json:"title,omitempty"`
	Description       *string `json:"description,omitempty"`
	Excerpt           *string `json:"excerpt,omitempty"`
	FeaturedImage     *string `json:"featured_image,omitempty"`
	Favicon           *string `json:"favicon,omitempty"`
	URL               *string `json:"url,omitempty"`
	OneClickSubscribe *bool   `json:"one_click_subscribe,omitempty"`
}

type UpdateRecommendationInput struct {
	IDPathParam
	Body struct {
		Recommendations []UpdateRecommendationBody `json:"recommendations"`
	}
}

type CheckRecommendationInput struct {
	Body struct {
		Recommendations []struct {
			URL string `json:"url"`
		} `json:"recommendations"`
	}
}

type AdminIncomingRecommendationsOutput struct {
	Recommendations []AdminIncomingRecommendationResource `json:"recommendations"`
	Meta            BrowseMeta                            `json:"meta"`
}

type AdminIncomingRecommendationResource struct {
	ID               string  `json:"id"`
	Title            string  `json:"title"`
	Excerpt          *string `json:"excerpt"`
	FeaturedImage    *string `json:"featured_image"`
	Favicon          *string `json:"favicon"`
	URL              string  `json:"url"`
	RecommendingBack bool    `json:"recommending_back"`
	CreatedAt        string  `json:"created_at"`
	UpdatedAt        *string `json:"updated_at"`
}

type AdminSnippetsOutput struct {
	Snippets []AdminSnippetResource `json:"snippets"`
	Meta     BrowseMeta             `json:"meta"`
}

type AdminSnippetOutput struct {
	Snippets []AdminSnippetResource `json:"snippets"`
}

type AdminSnippetResource struct {
	ID        string  `json:"id"`
	Name      string  `json:"name"`
	Mobiledoc string  `json:"mobiledoc"`
	Lexical   *string `json:"lexical"`
	CreatedAt string  `json:"created_at"`
	UpdatedAt string  `json:"updated_at"`
}

type SnippetBrowseQueryParams struct {
	CommonBrowseQueryParams
	Formats []string `query:"formats,omitempty" doc:"Output formats. Supported values: mobiledoc, lexical." enum:"mobiledoc,lexical"`
}

type SnippetsBrowseInput struct {
	SnippetBrowseQueryParams
}

type SnippetReadInput struct {
	IDPathParam
	Formats []string `query:"formats,omitempty" doc:"Output formats. Supported values: mobiledoc, lexical." enum:"mobiledoc,lexical"`
}

type CreateSnippetBody struct {
	Name      string  `json:"name" minLength:"1" maxLength:"191"`
	Mobiledoc string  `json:"mobiledoc" maxLength:"1000000000"`
	Lexical   *string `json:"lexical,omitempty" maxLength:"1000000000"`
}

type CreateSnippetInput struct {
	Formats []string `query:"formats,omitempty" doc:"Output formats." enum:"mobiledoc,lexical"`
	Body    struct {
		Snippets []CreateSnippetBody `json:"snippets" minItems:"1" maxItems:"1"`
	}
}

type UpdateSnippetBody struct {
	Name      *string `json:"name,omitempty" maxLength:"191"`
	Mobiledoc *string `json:"mobiledoc,omitempty" maxLength:"1000000000"`
	Lexical   *string `json:"lexical,omitempty" maxLength:"1000000000"`
}

type UpdateSnippetInput struct {
	IDPathParam
	Formats []string `query:"formats,omitempty" doc:"Output formats." enum:"mobiledoc,lexical"`
	Body    struct {
		Snippets []UpdateSnippetBody `json:"snippets" minItems:"1" maxItems:"1"`
	}
}

type AdminNotificationsOutput struct {
	Notifications []AdminNotificationResource `json:"notifications"`
}

type AdminNotificationResource struct {
	ID          string   `json:"id"`
	Dismissible bool     `json:"dismissible"`
	Location    string   `json:"location"`
	Status      string   `json:"status"`
	Type        string   `json:"type"`
	Message     string   `json:"message"`
	Custom      bool     `json:"custom"`
	CreatedAt   string   `json:"createdAt"`
	Seen        bool     `json:"seen"`
	AddedAt     string   `json:"addedAt"`
	SeenBy      []string `json:"seenBy,omitempty"`
}

type CreateNotificationBody struct {
	Type        string  `json:"type"`
	Message     string  `json:"message"`
	Custom      *bool   `json:"custom,omitempty"`
	Dismissible *bool   `json:"dismissible,omitempty"`
	Location    *string `json:"location,omitempty"`
	Status      *string `json:"status,omitempty"`
}

type CreateNotificationInput struct {
	Body struct {
		Notifications []CreateNotificationBody `json:"notifications"`
	}
}

type AdminThemesOutput struct {
	Themes []AdminThemeResource `json:"themes"`
}

type AdminThemeResource struct {
	Name      string            `json:"name"`
	Package   *ThemePackageInfo `json:"package,omitempty"`
	Active    bool              `json:"active"`
	Templates []ThemeTemplate   `json:"templates,omitempty"`
	Warnings  []ThemeMessage    `json:"warnings,omitempty"`
	Errors    []ThemeMessage    `json:"errors,omitempty"`
}

type ThemePackageInfo struct {
	Name        *string          `json:"name,omitempty"`
	Description *string          `json:"description,omitempty"`
	Version     *string          `json:"version,omitempty"`
	Engines     *ThemeEngines    `json:"engines,omitempty"`
	License     *string          `json:"license,omitempty"`
	Screenshots *ThemeScreenshot `json:"screenshots,omitempty"`
	Author      *ThemeAuthor     `json:"author,omitempty"`
}

type ThemeEngines struct {
	Ghost *string `json:"ghost,omitempty"`
}

type ThemeScreenshot struct {
	Desktop *string `json:"desktop,omitempty"`
}

type ThemeAuthor struct {
	Name  *string `json:"name,omitempty"`
	Email *string `json:"email,omitempty"`
	URL   *string `json:"url,omitempty"`
}

type ThemeTemplate struct {
	Filename string `json:"filename"`
	For      string `json:"for"`
	Slug     string `json:"slug"`
}

type ThemeMessage struct {
	Code    string  `json:"code"`
	Message string  `json:"message"`
	Details *string `json:"details,omitempty"`
	Level   string  `json:"level"`
	Rule    string  `json:"rule"`
}

type ThemeInstallInput struct {
	Source string `query:"source" doc:"Theme source. Supported values: github" enum:"github"`
	Ref    string `query:"ref" doc:"Theme reference (e.g., GitHub repo ref)"`
}

type ThemeActivateInput struct {
	NamePathParam
}

type AdminCustomThemeSettingsOutput struct {
	CustomThemeSettings []AdminCustomThemeSettingResource `json:"custom_theme_settings"`
}

type AdminCustomThemeSettingResource struct {
	Type string `json:"type"`
	ID   string `json:"id"`
	Key  string `json:"key"`
	// Value type depends on Type:
	//   "color": JSON string ("#rrggbb")
	//   "boolean": JSON boolean
	//   "select": JSON string (one of the option values)
	//   "image": JSON string (URL)
	//   "text": JSON string
	Value json.RawMessage `json:"value"`
}

type AdminIntegrationsOutput struct {
	Integrations []AdminIntegrationResource `json:"integrations"`
	Meta         BrowseMeta                 `json:"meta"`
}

type APIKeyResource struct {
	ID              string  `json:"id"`
	Type            string  `json:"type"`
	Secret          string  `json:"secret"`
	RoleID          *string `json:"role_id"`
	IntegrationID   *string `json:"integration_id"`
	UserID          *string `json:"user_id"`
	LastSeenAt      *string `json:"last_seen_at"`
	LastSeenVersion *string `json:"last_seen_version"`
	CreatedAt       string  `json:"created_at"`
	UpdatedAt       *string `json:"updated_at"`
}

type AdminIntegrationResource struct {
	ID          string            `json:"id"`
	Type        string            `json:"type"`
	Name        string            `json:"name"`
	Slug        string            `json:"slug"`
	IconImage   *string           `json:"icon_image"`
	Description *string           `json:"description"`
	CreatedAt   string            `json:"created_at"`
	UpdatedAt   *string           `json:"updated_at"`
	APIKeys     []APIKeyResource  `json:"api_keys,omitempty"`
	Webhooks    []WebhookResource `json:"webhooks,omitempty"`
}

type IntegrationInclude string

const (
	IntegrationIncludeAPIKeys  IntegrationInclude = "api_keys"
	IntegrationIncludeWebhooks IntegrationInclude = "webhooks"
)

type IntegrationBrowseQueryParams struct {
	CommonBrowseQueryParams
	Include []IntegrationInclude `query:"include,omitempty" doc:"Supported values: api_keys, webhooks"`
}

type IntegrationsBrowseInput struct {
	IntegrationBrowseQueryParams
}

type IntegrationReadInput struct {
	IDPathParam
	Include []IntegrationInclude `query:"include,omitempty" doc:"Supported values: api_keys, webhooks"`
}

type CreateIntegrationBody struct {
	Name        string              `json:"name"`
	IconImage   *string             `json:"icon_image,omitempty"`
	Description *string             `json:"description,omitempty"`
	Webhooks    []CreateWebhookBody `json:"webhooks,omitempty"`
}

type CreateIntegrationInput struct {
	Include []IntegrationInclude `query:"include,omitempty" doc:"Supported values: api_keys, webhooks"`
	Body    struct {
		Integrations []CreateIntegrationBody `json:"integrations"`
	}
}

type UpdateIntegrationBody struct {
	Name        *string             `json:"name,omitempty"`
	IconImage   *string             `json:"icon_image,omitempty"`
	Description *string             `json:"description,omitempty"`
	Webhooks    []CreateWebhookBody `json:"webhooks,omitempty"`
}

type UpdateIntegrationInput struct {
	IDPathParam
	Include []IntegrationInclude `query:"include,omitempty" doc:"Supported values: api_keys, webhooks"`
	Body    struct {
		Integrations []UpdateIntegrationBody `json:"integrations"`
	}
}

type AdminIntegrationOutput struct {
	Integrations []AdminIntegrationResource `json:"integrations"`
}

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

type AdminLabelsOutput struct {
	Labels []MemberLabelResource `json:"labels"`
	Meta   BrowseMeta            `json:"meta"`
}

type AdminAutomatedEmailResource struct {
	ID                   string  `json:"id"`
	Status               string  `json:"status" enum:"active,inactive"`
	Name                 string  `json:"name"`
	Slug                 string  `json:"slug"`
	Subject              string  `json:"subject"`
	Lexical              *string `json:"lexical"`
	SenderName           *string `json:"sender_name"`
	SenderEmail          *string `json:"sender_email"`
	SenderReplyTo        *string `json:"sender_reply_to"`
	EmailDesignSettingID string  `json:"email_design_setting_id"`
	CreatedAt            string  `json:"created_at"`
	UpdatedAt            *string `json:"updated_at"`
}

type AdminAutomatedEmailsOutput struct {
	AutomatedEmails []AdminAutomatedEmailResource `json:"automated_emails"`
	Meta            BrowseMeta                    `json:"meta"`
}

type AdminAutomatedEmailOutput struct {
	AutomatedEmails []AdminAutomatedEmailResource `json:"automated_emails"`
}

type CreateAutomatedEmailBody struct {
	Name          string  `json:"name"`
	Subject       string  `json:"subject"`
	Lexical       *string `json:"lexical,omitempty"`
	SenderName    *string `json:"sender_name,omitempty"`
	SenderEmail   *string `json:"sender_email,omitempty"`
	SenderReplyTo *string `json:"sender_reply_to,omitempty"`
}

type CreateAutomatedEmailInput struct {
	Body struct {
		AutomatedEmails []CreateAutomatedEmailBody `json:"automated_emails"`
	}
}

type UpdateAutomatedEmailBody struct {
	Status        *string `json:"status,omitempty" enum:"active,inactive"`
	Name          *string `json:"name,omitempty"`
	Subject       *string `json:"subject,omitempty"`
	Lexical       *string `json:"lexical,omitempty"`
	SenderName    *string `json:"sender_name,omitempty"`
	SenderEmail   *string `json:"sender_email,omitempty"`
	SenderReplyTo *string `json:"sender_reply_to,omitempty"`
}

type UpdateAutomatedEmailInput struct {
	IDPathParam
	Body struct {
		AutomatedEmails []UpdateAutomatedEmailBody `json:"automated_emails"`
	}
}

type TestAutomatedEmailInput struct {
	IDPathParam
	Body struct {
		Email   string  `json:"email"`
		Subject *string `json:"subject,omitempty"`
		Lexical *string `json:"lexical,omitempty"`
	}
}

type AdminStatsSeriesPoint struct {
	Date string `json:"date"`
}

// AdminStatsOutput wraps various stats endpoints. The shape of each element
// in Stats and the Meta object depends on the specific stats endpoint called.
// Common patterns:
//
//	member_count: Stats=[{"date":"...","paid":N,"free":N,"comped":N}] Meta={"totals":{...}}
//	mrr: Stats=[{"date":"...","mrr":N,"currency":"..."}] Meta={"totals":[...]}
//	referrers: Stats=[{"source":"...","free_members":N,"paid_members":N}]
//	top content: Stats=[{"url":"...","visits":N}]
type AdminStatsOutput struct {
	Stats []json.RawMessage `json:"stats"`
	Meta  json.RawMessage   `json:"meta,omitempty"`
}

type AdminFeedbackEntry struct {
	ID        string `json:"id"`
	PostID    string `json:"post_id"`
	MemberID  string `json:"member_id"`
	Score     int    `json:"score"`
	CreatedAt string `json:"created_at"`
}

type AdminFeedbackOutput struct {
	Feedback []AdminFeedbackEntry `json:"feedback"`
	Meta     BrowseMeta           `json:"meta"`
}

type SessionUserInfo struct {
	UserID string `json:"user_id"`
}

type AdminSessionOutput struct {
	Session []SessionUserInfo `json:"session"`
}

type AdminCreateSessionInput struct {
	Body struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
}

type AdminVerifySessionInput struct {
	Body struct {
		Token string `json:"token"`
	}
}

type PasswordResetMessage struct {
	Message string `json:"message"`
}

type InvitationMessage struct {
	Message string `json:"message"`
	Valid   bool   `json:"valid,omitempty"`
}

type SetupStatus struct {
	Status bool `json:"status"`
}

type AdminAuthenticationMessageOutput struct {
	PasswordReset []PasswordResetMessage `json:"password_reset,omitempty"`
	Invitation    []InvitationMessage    `json:"invitation,omitempty"`
	Setup         []SetupStatus          `json:"setup,omitempty"`
}

type DBExportMeta struct {
	ExportedOn int64  `json:"exported_on"`
	Version    string `json:"version"`
}

type DBEntry struct {
	Meta DBExportMeta `json:"meta"`
}

type AdminDBOutput struct {
	DB []DBEntry `json:"db"`
}
