package schema

type ListTagsInput struct {
	BrowseQueryParams
}

type TagResource struct {
	Slug string `json:"slug"`
	ID   string `json:"id"`

	// ghost metadata schema
	MetaTitle       *string `json:"meta_title"`
	MetaDescription *string `json:"meta_description"`

	// ghost code injection schema
	CodeinjectionHead *string `json:"codeinjection_head"`
	CodeinjectionFoot *string `json:"codeinjection_foot"`

	// ghost social media schema
	OgImage            *string `json:"og_image"`
	OgTitle            *string `json:"og_title"`
	OgDescription      *string `json:"og_description"`
	TwitterImage       *string `json:"twitter_image"`
	TwitterTitle       *string `json:"twitter_title"`
	TwitterDescription *string `json:"twitter_description"`

	// tags schema
	Name         string  `json:"name"`
	Description  *string `json:"description"`
	FeatureImage *string `json:"feature_image"`
	Visibility   string  `json:"visibility"`
	CanonicalURL *string `json:"canonical_url"`
	AccentColor  *string `json:"accent_color"`
	URL          string  `json:"url"`

	// Optional count of posts, only returned if include=count.posts is provided.
	Count *PostCountMeta `json:"count,omitempty"`
}

type ListTagsOutput struct {
	Tags []TagResource `json:"tags"`
	Meta BrowseMeta    `json:"meta"`
}

type GetTagOutput struct {
	Tags []TagResource `json:"tags"`
}
