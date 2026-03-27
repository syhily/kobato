package schema

// List pages
type ListPagesInput struct {
	PageBrowseQueryParams
}

// Page resource
type PageResource struct {
	Slug string `json:"slug"`
	ID   string `json:"id"`
	UUID string `json:"uuid"`

	MetaTitle       *string `json:"meta_title"`
	MetaDescription *string `json:"meta_description"`

	Title               string  `json:"title"`
	HTML                string  `json:"html"`
	Plaintext           *string `json:"plaintext"`
	CommentID           *string `json:"comment_id"`
	FeatureImage        *string `json:"feature_image"`
	FeatureImageAlt     *string `json:"feature_image_alt"`
	FeatureImageCaption *string `json:"feature_image_caption"`
	Featured            bool    `json:"featured"`
	CustomExcerpt       *string `json:"custom_excerpt"`

	CodeinjectionHead  *string `json:"codeinjection_head"`
	CodeinjectionFoot  *string `json:"codeinjection_foot"`
	OgImage            *string `json:"og_image"`
	OgTitle            *string `json:"og_title"`
	OgDescription      *string `json:"og_description"`
	TwitterImage       *string `json:"twitter_image"`
	TwitterTitle       *string `json:"twitter_title"`
	TwitterDescription *string `json:"twitter_description"`

	Visibility     string           `json:"visibility"`
	CustomTemplate *string          `json:"custom_template"`
	CanonicalURL   *string          `json:"canonical_url"`
	Authors        []AuthorResource `json:"authors,omitempty"`
	Tags           []TagResource    `json:"tags,omitempty"`
	PrimaryAuthor  *AuthorResource  `json:"primary_author"`
	PrimaryTag     *TagResource     `json:"primary_tag"`
	URL            string           `json:"url"`
	Excerpt        string           `json:"excerpt"`
	ReadingTime    int              `json:"reading_time"`
	CreatedAt      string           `json:"created_at"`
	UpdatedAt      string           `json:"updated_at"`
	PublishedAt    string           `json:"published_at"`
	Access         bool             `json:"access"`
	Comments       bool             `json:"comments"`
	EmailSubject   *string          `json:"email_subject"`
}

// List pages output
type ListPagesOutput struct {
	Pages []PageResource `json:"pages"`
	Meta  BrowseMeta     `json:"meta"`
}

// Get page by ID or slug output
type GetPageOutput struct {
	Pages []PageResource `json:"pages"`
}
