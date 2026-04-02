package schema

type TagResource struct {
	Slug string `json:"slug"`
	ID   string `json:"id"`

	MetaTitle       *string `json:"meta_title"`
	MetaDescription *string `json:"meta_description"`

	CodeinjectionHead *string `json:"codeinjection_head"`
	CodeinjectionFoot *string `json:"codeinjection_foot"`

	OgImage            *string `json:"og_image"`
	OgTitle            *string `json:"og_title"`
	OgDescription      *string `json:"og_description"`
	TwitterImage       *string `json:"twitter_image"`
	TwitterTitle       *string `json:"twitter_title"`
	TwitterDescription *string `json:"twitter_description"`

	Name         string  `json:"name"`
	Description  *string `json:"description"`
	FeatureImage *string `json:"feature_image"`
	Visibility   string  `json:"visibility"`
	CanonicalURL *string `json:"canonical_url"`
	AccentColor  *string `json:"accent_color"`
	URL          string  `json:"url"`

	CreatedAt *string        `json:"created_at"`
	UpdatedAt *string        `json:"updated_at"`
	Count     *PostCountMeta `json:"count,omitempty"`
}

type ListTagsOutput struct {
	Tags []TagResource `json:"tags"`
	Meta BrowseMeta    `json:"meta"`
}

type TagOutput struct {
	Tags []TagResource `json:"tags"`
}

// TagEditFields contains the common editable fields shared by tag create/update bodies.
type TagEditFields struct {
	Slug               *string `json:"slug,omitempty" maxLength:"191"`
	Description        *string `json:"description,omitempty" maxLength:"500"`
	FeatureImage       *string `json:"feature_image,omitempty" maxLength:"2000"`
	Visibility         *string `json:"visibility,omitempty" enum:"public,internal"`
	MetaTitle          *string `json:"meta_title,omitempty" maxLength:"300"`
	MetaDescription    *string `json:"meta_description,omitempty" maxLength:"500"`
	OgImage            *string `json:"og_image,omitempty" maxLength:"2000"`
	OgTitle            *string `json:"og_title,omitempty" maxLength:"300"`
	OgDescription      *string `json:"og_description,omitempty" maxLength:"500"`
	TwitterImage       *string `json:"twitter_image,omitempty" maxLength:"2000"`
	TwitterTitle       *string `json:"twitter_title,omitempty" maxLength:"300"`
	TwitterDescription *string `json:"twitter_description,omitempty" maxLength:"500"`
	CodeinjectionHead  *string `json:"codeinjection_head,omitempty" maxLength:"65535"`
	CodeinjectionFoot  *string `json:"codeinjection_foot,omitempty" maxLength:"65535"`
	CanonicalURL       *string `json:"canonical_url,omitempty" maxLength:"2000"`
	AccentColor        *string `json:"accent_color,omitempty" maxLength:"50"`
}

type CreateTagBody struct {
	Name string `json:"name" minLength:"1" maxLength:"191" pattern:"^([^,]|$)"`
	TagEditFields
}

type CreateTagInput struct {
	Include []TagInclude `query:"include,omitempty" doc:"Supported values: count.posts"`
	Body    struct {
		Tags []CreateTagBody `json:"tags" minItems:"1" maxItems:"1"`
	}
}

type UpdateTagBody struct {
	Name *string `json:"name,omitempty" maxLength:"191" pattern:"^([^,]|$)"`
	TagEditFields
}

type UpdateTagInput struct {
	IDPathParam
	Include []TagInclude `query:"include,omitempty" doc:"Supported values: count.posts"`
	Body    struct {
		Tags []UpdateTagBody `json:"tags" minItems:"1" maxItems:"1"`
	}
}
