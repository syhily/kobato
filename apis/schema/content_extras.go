package schema

// BaseRecommendationResource contains the fields shared by both admin and
// content API recommendation resources.
type BaseRecommendationResource struct {
	ID                string  `json:"id"`
	Title             string  `json:"title"`
	Description       *string `json:"description"`
	Excerpt           *string `json:"excerpt"`
	FeaturedImage     *string `json:"featured_image"`
	Favicon           *string `json:"favicon"`
	URL               string  `json:"url"`
	OneClickSubscribe bool    `json:"one_click_subscribe"`
	CreatedAt         string  `json:"created_at"`
	UpdatedAt         *string `json:"updated_at"`
}

type RecommendationResource struct {
	BaseRecommendationResource
}

type ContentRecommendationsBrowseInput struct {
	CommonBrowseQueryParams
}

type ContentRecommendationsOutput struct {
	Recommendations []RecommendationResource `json:"recommendations"`
	Meta            BrowseMeta               `json:"meta"`
}

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
