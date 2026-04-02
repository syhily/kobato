package schema

import (
	"encoding/json"

	"github.com/danielgtaylor/huma/v2"
)

type AdminNoContentOutput struct{}

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

type OEmbedReadInput struct {
	URL  string  `query:"url" doc:"URL to fetch oEmbed data for"`
	Type string `query:"type,omitempty" doc:"Type of oEmbed (e.g., bookmark)"`
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
