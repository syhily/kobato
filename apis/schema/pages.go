package schema

// Content API outputs

type ListPagesOutput struct {
	Pages []ContentResource `json:"pages"`
	Meta  BrowseMeta        `json:"meta"`
}

type PageOutput struct {
	Pages []ContentResource `json:"pages"`
}

// Admin page types

type AdminPageCountMeta struct {
	Clicks           int `json:"clicks"`
	PositiveFeedback int `json:"positive_feedback"`
	NegativeFeedback int `json:"negative_feedback"`
	PaidConversions  int `json:"paid_conversions"`
	Signups          int `json:"signups"`
}

type AdminPageResource struct {
	AdminPostPageResource
	Mobiledoc                *string             `json:"mobiledoc"`
	Lexical                  *string             `json:"lexical"`
	Status                   string              `json:"status"`
	Frontmatter              *string             `json:"frontmatter"`
	ShowTitleAndFeatureImage *bool               `json:"show_title_and_feature_image,omitempty"`
	Count                    *AdminPageCountMeta `json:"count,omitempty"`
}

type CreatePageBody struct {
	Title                    string  `json:"title" maxLength:"2000"`
	UpdatedAt                *string `json:"updated_at,omitempty"`
	Status                   *string `json:"status,omitempty" enum:"draft,published,scheduled"`
	ShowTitleAndFeatureImage *bool   `json:"show_title_and_feature_image,omitempty"`
	PostPageContentFields
}

type CreatePageInput struct {
	Include []AdminPageInclude `query:"include,omitempty" doc:"Relationships to include in response"`
	Formats []string           `query:"formats,omitempty" doc:"Output formats. Supported values: lexical, html, plaintext, mobiledoc." enum:"lexical,html,plaintext,mobiledoc"`
	Source  string             `query:"source,omitempty" doc:"Set to 'html' when creating a page from HTML content" enum:"html"`
	Body    struct {
		Pages []CreatePageBody `json:"pages" minItems:"1" maxItems:"1"`
	}
}

type UpdatePageBody struct {
	Title                    *string `json:"title,omitempty" maxLength:"2000"`
	UpdatedAt                string  `json:"updated_at"`
	Status                   *string `json:"status,omitempty" enum:"draft,published,scheduled"`
	ShowTitleAndFeatureImage *bool   `json:"show_title_and_feature_image,omitempty"`
	PostPageContentFields
}

type UpdatePageInput struct {
	IDPathParam
	Include          []AdminPageInclude `query:"include,omitempty" doc:"Relationships to include in response"`
	Formats          []string           `query:"formats,omitempty" doc:"Output formats. Supported values: lexical, html, plaintext, mobiledoc." enum:"lexical,html,plaintext,mobiledoc"`
	ForceRerender    bool               `query:"force_rerender,omitempty" doc:"Force re-render of the page"`
	SaveRevision     bool               `query:"save_revision,omitempty" doc:"Save a revision of the page"`
	ConvertToLexical bool               `query:"convert_to_lexical,omitempty" doc:"Convert mobiledoc to lexical"`
	Source           string             `query:"source,omitempty" doc:"Set to 'html' when updating from HTML content" enum:"html"`
	Body             struct {
		Pages []UpdatePageBody `json:"pages" minItems:"1" maxItems:"1"`
	}
}

type CopyPageInput struct {
	IDPathParam
	Formats []string `query:"formats,omitempty" doc:"Output formats. Supported values: lexical, html, plaintext, mobiledoc." enum:"lexical,html,plaintext,mobiledoc"`
}

type DeletePageInput struct {
	IDPathParam
	Include []AdminPageInclude `query:"include,omitempty" doc:"Relationships to include in response"`
}

type AdminListPagesOutput struct {
	Pages []AdminPageResource `json:"pages"`
	Meta  BrowseMeta          `json:"meta"`
}

type AdminPageOutput struct {
	Pages []AdminPageResource `json:"pages"`
}
