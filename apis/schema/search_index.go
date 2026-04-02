package schema

// Admin search index types

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

// Content search index types

type ContentSearchIndexPostResource struct {
	ID         string `json:"id"`
	Slug       string `json:"slug"`
	Title      string `json:"title"`
	Excerpt    string `json:"excerpt"`
	URL        string `json:"url"`
	UpdatedAt  string `json:"updated_at"`
	Visibility string `json:"visibility"`
}

type ContentSearchIndexAuthorResource struct {
	ID           string  `json:"id"`
	Slug         string  `json:"slug"`
	Name         string  `json:"name"`
	URL          string  `json:"url"`
	ProfileImage *string `json:"profile_image"`
}

type ContentSearchIndexTagResource struct {
	ID   string `json:"id"`
	Slug string `json:"slug"`
	Name string `json:"name"`
	URL  string `json:"url"`
}

type ContentSearchIndexPostsOutput struct {
	Posts []ContentSearchIndexPostResource `json:"posts"`
}

type ContentSearchIndexAuthorsOutput struct {
	Authors []ContentSearchIndexAuthorResource `json:"authors"`
}

type ContentSearchIndexTagsOutput struct {
	Tags []ContentSearchIndexTagResource `json:"tags"`
}
