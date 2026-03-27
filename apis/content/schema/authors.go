package schema

type ListAuthorsInput struct {
	BrowseQueryParams
}

type AuthorResource struct {
	Slug string `json:"slug"`
	ID   string `json:"id"`

	// ghost metadata schema
	MetaTitle       *string `json:"meta_title"`
	MetaDescription *string `json:"meta_description"`

	// authors schema
	Name         string  `json:"name"`
	ProfileImage *string `json:"profile_image"`
	CoverImage   *string `json:"cover_image"`
	Bio          *string `json:"bio"`
	Website      *string `json:"website"`
	Location     *string `json:"location"`
	Facebook     *string `json:"facebook"`
	Twitter      *string `json:"twitter"`
	URL          *string `json:"url"`

	// Optional count of posts, only returned if include=count.posts is provided.
	Count *PostCountMeta `json:"count,omitempty"`
}

type ListAuthorsOutput struct {
	Authors []AuthorResource `json:"authors"`
	Meta    BrowseMeta       `json:"meta"`
}

type GetAuthorOutput struct {
	Authors []AuthorResource `json:"authors"`
}
