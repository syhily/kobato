package schema

// SharedPostPageResource contains the fields shared by post/page resources
// across the content and admin APIs.
type SharedPostPageResource struct {
	Slug string `json:"slug"`
	ID   string `json:"id"`
	UUID string `json:"uuid"`

	MetaTitle       *string `json:"meta_title"`
	MetaDescription *string `json:"meta_description"`

	Title               string  `json:"title"`
	HTML                *string `json:"html"`
	Plaintext           *string `json:"plaintext"`
	CommentID           *string `json:"comment_id"`
	FeatureImage        *string `json:"feature_image"`
	FeatureImageAlt     *string `json:"feature_image_alt"`
	FeatureImageCaption *string `json:"feature_image_caption"`
	Featured            bool    `json:"featured"`
	CustomExcerpt       *string `json:"custom_excerpt"`
	Frontmatter         *string `json:"frontmatter,omitempty"`

	CodeinjectionHead  *string `json:"codeinjection_head"`
	CodeinjectionFoot  *string `json:"codeinjection_foot"`
	OgImage            *string `json:"og_image"`
	OgTitle            *string `json:"og_title"`
	OgDescription      *string `json:"og_description"`
	TwitterImage       *string `json:"twitter_image"`
	TwitterTitle       *string `json:"twitter_title"`
	TwitterDescription *string `json:"twitter_description"`

	Visibility     string                 `json:"visibility"`
	CustomTemplate *string                `json:"custom_template"`
	CanonicalURL   *string                `json:"canonical_url"`
	URL            string                 `json:"url"`
	Excerpt        string                 `json:"excerpt"`
	ReadingTime    int                    `json:"reading_time"`
	CreatedAt      string                 `json:"created_at"`
	UpdatedAt      *string                `json:"updated_at"`
	PublishedAt    *string                `json:"published_at"`
	Comments       bool                   `json:"comments"`
	Sentiment      *int                   `json:"sentiment,omitempty"`
	Tiers          []TierResource         `json:"tiers,omitempty"`
	PostRevisions  []PostRevisionResource `json:"post_revisions,omitempty"`
	IsPage         bool                   `json:"is_page"`
}

type SharedPostPageTagRelations struct {
	Tags       []TagResource `json:"tags,omitempty"`
	PrimaryTag *TagResource  `json:"primary_tag"`
}

// ContentResource represents a post or page in the Content API.
// Posts and pages share an identical field set; the IsPage flag distinguishes them.
type ContentResource struct {
	SharedPostPageResource
	SharedPostPageTagRelations
	Authors       []AuthorResource `json:"authors,omitempty"`
	PrimaryAuthor *AuthorResource  `json:"primary_author"`
	Access        bool             `json:"access"`
}

// AdminPostPageResource contains the shared admin-facing fields for posts/pages.
type AdminPostPageResource struct {
	SharedPostPageResource
	SharedPostPageTagRelations
	Authors       []UserResource `json:"authors,omitempty"`
	PrimaryAuthor *UserResource  `json:"primary_author"`
}

// Content API outputs

type ListPostsOutput struct {
	Posts []ContentResource `json:"posts"`
	Meta  BrowseMeta        `json:"meta"`
}

type PostOutput struct {
	Posts []ContentResource `json:"posts"`
}

// Admin post types

type AdminPostCountMeta struct {
	Conversions      int `json:"conversions"`
	Signups          int `json:"signups"`
	PaidConversions  int `json:"paid_conversions"`
	Clicks           int `json:"clicks"`
	PositiveFeedback int `json:"positive_feedback"`
	NegativeFeedback int `json:"negative_feedback"`
}

type TierResource struct {
	ID             string  `json:"id"`
	Name           string  `json:"name"`
	Slug           string  `json:"slug"`
	Active         bool    `json:"active"`
	WelcomePageURL *string `json:"welcome_page_url"`
	Visibility     string  `json:"visibility"`
	TrialDays      *int    `json:"trial_days"`
	Description    *string `json:"description"`
	Type           string  `json:"type"`
	Currency       *string `json:"currency"`
	MonthlyPrice   *int    `json:"monthly_price"`
	YearlyPrice    *int    `json:"yearly_price"`
	MonthlyPriceID *string `json:"monthly_price_id"`
	YearlyPriceID  *string `json:"yearly_price_id"`
	CreatedAt      string  `json:"created_at"`
	UpdatedAt      *string `json:"updated_at"`
}

type PostRevisionResource struct {
	ID                  string        `json:"id"`
	PostID              string        `json:"post_id"`
	Lexical             *string       `json:"lexical"`
	Title               *string       `json:"title"`
	PostStatus          *string       `json:"post_status"`
	Reason              *string       `json:"reason"`
	FeatureImage        *string       `json:"feature_image"`
	FeatureImageAlt     *string       `json:"feature_image_alt"`
	FeatureImageCaption *string       `json:"feature_image_caption"`
	CustomExcerpt       *string       `json:"custom_excerpt"`
	CreatedAt           string        `json:"created_at"`
	Author              *UserResource `json:"author,omitempty"`
}

type AdminPostResource struct {
	AdminPostPageResource
	Mobiledoc    *string             `json:"mobiledoc"`
	Lexical      *string             `json:"lexical"`
	Status       string              `json:"status"`
	EmailOnly    bool                `json:"email_only"`
	EmailSubject *string             `json:"email_subject,omitempty"`
	EmailSegment *string             `json:"email_segment"`
	Frontmatter  *string             `json:"frontmatter"`
	Email        *EmailResource      `json:"email"`
	Newsletter   *NewsletterResource `json:"newsletter"`
	Count        *AdminPostCountMeta `json:"count,omitempty"`
}

// PostPageContentFields contains the common editable content fields shared by
// post and page create/update request bodies.
type PostPageContentFields struct {
	Slug                *string     `json:"slug,omitempty" maxLength:"191"`
	Mobiledoc           *string     `json:"mobiledoc,omitempty" maxLength:"1000000000"`
	Lexical             *string     `json:"lexical,omitempty" maxLength:"1000000000"`
	HTML                *string     `json:"html,omitempty" maxLength:"1000000000"`
	FeatureImage        *string     `json:"feature_image,omitempty" maxLength:"2000"`
	FeatureImageAlt     *string     `json:"feature_image_alt,omitempty" maxLength:"65535"`
	FeatureImageCaption *string     `json:"feature_image_caption,omitempty" maxLength:"65535"`
	Featured            *bool       `json:"featured,omitempty"`
	Locale              *string     `json:"locale,omitempty" maxLength:"6"`
	Visibility          *string     `json:"visibility,omitempty"`
	MetaTitle           *string     `json:"meta_title,omitempty" maxLength:"300"`
	MetaDescription     *string     `json:"meta_description,omitempty" maxLength:"500"`
	PublishedAt         *string     `json:"published_at,omitempty"`
	CustomExcerpt       *string     `json:"custom_excerpt,omitempty" maxLength:"300"`
	CodeinjectionHead   *string     `json:"codeinjection_head,omitempty" maxLength:"65535"`
	CodeinjectionFoot   *string     `json:"codeinjection_foot,omitempty" maxLength:"65535"`
	OgImage             *string     `json:"og_image,omitempty" maxLength:"2000"`
	OgTitle             *string     `json:"og_title,omitempty" maxLength:"300"`
	OgDescription       *string     `json:"og_description,omitempty" maxLength:"500"`
	TwitterImage        *string     `json:"twitter_image,omitempty" maxLength:"2000"`
	TwitterTitle        *string     `json:"twitter_title,omitempty" maxLength:"300"`
	TwitterDescription  *string     `json:"twitter_description,omitempty" maxLength:"500"`
	CustomTemplate      *string     `json:"custom_template,omitempty" maxLength:"100"`
	CanonicalURL        *string     `json:"canonical_url,omitempty" maxLength:"2000"`
	VisibilityFilter    *string     `json:"visibility_filter,omitempty"`
	Tags                []SlugRef   `json:"tags,omitempty"`
	Authors             []AuthorRef `json:"authors,omitempty"`
	Tiers               []SlugRef   `json:"tiers,omitempty"`
}

type CreatePostBody struct {
	Title        string          `json:"title" maxLength:"2000"`
	UpdatedAt    *string         `json:"updated_at,omitempty"`
	Status       *string         `json:"status,omitempty" enum:"draft,published,scheduled,sent"`
	EmailSubject *string         `json:"email_subject,omitempty" maxLength:"300"`
	EmailOnly    *bool           `json:"email_only,omitempty"`
	Newsletter   *SlugRef        `json:"newsletter,omitempty"`
	Collections  []CollectionRef `json:"collections,omitempty"`
	PostPageContentFields
}

type CreatePostInput struct {
	Include []AdminPostInclude `query:"include,omitempty" doc:"Relationships to include in response"`
	Formats []string           `query:"formats,omitempty" doc:"Output formats. Supported values: lexical, html, plaintext, mobiledoc." enum:"lexical,html,plaintext,mobiledoc"`
	Source  *string            `query:"source,omitempty" doc:"Set to 'html' when creating a post from HTML content" enum:"html"`
	Body    struct {
		Posts []CreatePostBody `json:"posts" minItems:"1" maxItems:"1"`
	}
}

type UpdatePostBody struct {
	Title        *string         `json:"title,omitempty" maxLength:"2000"`
	UpdatedAt    string          `json:"updated_at"`
	Status       *string         `json:"status,omitempty" enum:"draft,published,scheduled,sent"`
	EmailSubject *string         `json:"email_subject,omitempty" maxLength:"300"`
	EmailOnly    *bool           `json:"email_only,omitempty"`
	Newsletter   *SlugRef        `json:"newsletter,omitempty"`
	Collections  []CollectionRef `json:"collections,omitempty"`
	PostPageContentFields
}

type UpdatePostInput struct {
	IDPathParam
	Include          []AdminPostInclude `query:"include,omitempty" doc:"Relationships to include in response"`
	Formats          []string           `query:"formats,omitempty" doc:"Output formats. Supported values: lexical, html, plaintext, mobiledoc." enum:"lexical,html,plaintext,mobiledoc"`
	Newsletter       *string            `query:"newsletter,omitempty" doc:"Newsletter slug to send the post to"`
	EmailSegment     *string            `query:"email_segment,omitempty" doc:"Email recipient segment"`
	ForceRerender    *bool              `query:"force_rerender,omitempty" doc:"Force re-render of the post"`
	SaveRevision     *bool              `query:"save_revision,omitempty" doc:"Save a revision of the post"`
	ConvertToLexical *bool              `query:"convert_to_lexical,omitempty" doc:"Convert mobiledoc to lexical"`
	Source           *string            `query:"source,omitempty" doc:"Set to 'html' when updating from HTML content" enum:"html"`
	Body             struct {
		Posts []UpdatePostBody `json:"posts" minItems:"1" maxItems:"1"`
	}
}

type CopyPostInput struct {
	IDPathParam
	Formats []string `query:"formats,omitempty" doc:"Output formats. Supported values: lexical, html, plaintext, mobiledoc." enum:"lexical,html,plaintext,mobiledoc"`
}

type DeletePostInput struct {
	IDPathParam
	Include []AdminPostInclude `query:"include,omitempty" doc:"Relationships to include in response"`
}

type AdminListPostsOutput struct {
	Posts []AdminPostResource `json:"posts"`
	Meta  BrowseMeta          `json:"meta"`
}

type AdminPostOutput struct {
	Posts []AdminPostResource `json:"posts"`
}
