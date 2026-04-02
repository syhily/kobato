package schema

type LabelCountMeta struct {
	Members int `json:"members"`
}

type MemberLabelResource struct {
	ID        string          `json:"id"`
	Name      string          `json:"name"`
	Slug      string          `json:"slug"`
	CreatedAt string          `json:"created_at"`
	UpdatedAt *string         `json:"updated_at"`
	Count     *LabelCountMeta `json:"count,omitempty"`
}

type LabelsBrowseInput struct {
	CommonBrowseQueryParams
}

type LabelReadByIDInput struct {
	IDPathParam
	CommonReadQueryParams
}

type LabelReadBySlugInput struct {
	SlugPathParam
	CommonReadQueryParams
}

type CreateLabelBody struct {
	Name string  `json:"name" minLength:"1" maxLength:"191" pattern:"^([^,]|$)"`
	Slug *string `json:"slug,omitempty" maxLength:"191"`
}

type CreateLabelInput struct {
	Body struct {
		Labels []CreateLabelBody `json:"labels" minItems:"1" maxItems:"1"`
	}
}

type UpdateLabelBody struct {
	Name *string `json:"name,omitempty" maxLength:"191"`
	Slug *string `json:"slug,omitempty" maxLength:"191"`
}

type UpdateLabelInput struct {
	IDPathParam
	Body struct {
		Labels []UpdateLabelBody `json:"labels" minItems:"1" maxItems:"1"`
	}
}

type AdminLabelOutput struct {
	Labels []MemberLabelResource `json:"labels"`
}

type AdminLabelsOutput struct {
	Labels []MemberLabelResource `json:"labels"`
	Meta   BrowseMeta            `json:"meta"`
}
