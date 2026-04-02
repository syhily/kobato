package schema

type AuthorResource struct {
	Slug string `json:"slug"`
	ID   string `json:"id"`

	MetaTitle       *string `json:"meta_title"`
	MetaDescription *string `json:"meta_description"`

	Name         string  `json:"name"`
	ProfileImage *string `json:"profile_image"`
	CoverImage   *string `json:"cover_image"`
	Bio          *string `json:"bio"`
	Website      *string `json:"website"`
	Location     *string `json:"location"`
	Facebook     *string `json:"facebook"`
	Twitter      *string `json:"twitter"`
	Threads      *string `json:"threads,omitempty"`
	Bluesky      *string `json:"bluesky,omitempty"`
	Mastodon     *string `json:"mastodon,omitempty"`
	Tiktok       *string `json:"tiktok,omitempty"`
	Youtube      *string `json:"youtube,omitempty"`
	Instagram    *string `json:"instagram,omitempty"`
	Linkedin     *string `json:"linkedin,omitempty"`
	URL          *string `json:"url"`

	Count *PostCountMeta `json:"count,omitempty"`
}

type ListAuthorsOutput struct {
	Authors []AuthorResource `json:"authors"`
	Meta    BrowseMeta       `json:"meta"`
}

type AuthorOutput struct {
	Authors []AuthorResource `json:"authors"`
}
