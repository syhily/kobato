package schema

var (
	CommonErrorCodes = []int{400, 401, 403, 404, 500}
)

// QueryInclude is a type alias for a string that represents the include parameter.
type QueryInclude string

const (
	QueryIncludeAuthors    QueryInclude = "authors"
	QueryIncludeTags       QueryInclude = "tags"
	QueryIncludeCountPosts QueryInclude = "count.posts"
	QueryIncludeCountPages QueryInclude = "count.pages"
	QueryIncludeCountTags  QueryInclude = "count.tags"
)

// BrowseQueryParams is a generic struct that represents the query parameters for browse endpoints.
type BrowseQueryParams struct {
	Include []QueryInclude `query:"include,omitempty" doc:"Related data to include"`
	Fields  []string       `query:"fields,omitempty" doc:"Comma-separated fields to return"`
	Filter  string         `query:"filter,omitempty" doc:"NQL filter expression for browse endpoints"`
	Limit   int            `query:"limit,omitempty" minimum:"1" maximum:"100" default:"15"`
	Page    int            `query:"page,omitempty" minimum:"1" default:"1"`
	Order   string         `query:"order,omitempty" doc:"Order by expression"`
}

// PostBrowseQueryParams is a struct that represents the query parameters for a post browse endpoint.
type PostBrowseQueryParams struct {
	BrowseQueryParams
	Formats []string `query:"formats,omitempty" doc:"Post/Page output formats, e.g. html,plaintext" default:"html"`
}

// PageBrowseQueryParams is a struct that represents the query parameters for a page browse endpoint.
type PageBrowseQueryParams struct {
	BrowseQueryParams
	Formats []string `query:"formats,omitempty" doc:"Post/Page output formats, e.g. html,plaintext" default:"html"`
}

// IDPathParam is a struct that represents the path parameter for a resource by ID.
type IDPathParam struct {
	ID string `path:"id" doc:"Resource ID"`
}

// SlugPathParam is a struct that represents the path parameter for a resource by slug.
type SlugPathParam struct {
	Slug string `path:"slug" doc:"Resource slug"`
}

// PaginationMeta is a struct that represents the pagination metadata for a browse endpoint.
type PaginationMeta struct {
	Page  int  `json:"page"`
	Limit int  `json:"limit"`
	Pages int  `json:"pages"`
	Total int  `json:"total"`
	Next  *int `json:"next"`
	Prev  *int `json:"prev"`
}

// BrowseMeta is a struct that represents the metadata for a browse endpoint.
type BrowseMeta struct {
	Pagination PaginationMeta `json:"pagination"`
}

type PostCountMeta struct {
	Posts int `json:"posts"`
}

type ContentErrorItem struct {
	Message   string `json:"message"`
	ErrorType string `json:"errorType"`
}

type ContentErrorBody struct {
	Errors []ContentErrorItem `json:"errors"`
}
