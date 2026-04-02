package schema

var (
	ContentErrorCodes = []int{400, 401, 403, 404, 500}
	AdminErrorCodes   = []int{400, 401, 403, 404, 422, 500}
)

type ContentPostInclude string

const (
	ContentPostIncludeAuthors   ContentPostInclude = "authors"
	ContentPostIncludeTags      ContentPostInclude = "tags"
	ContentPostIncludeSentiment ContentPostInclude = "sentiment"
)

type ContentPageInclude string

const (
	ContentPageIncludeAuthors ContentPageInclude = "authors"
	ContentPageIncludeTags    ContentPageInclude = "tags"
)

type AdminPostInclude string

const (
	AdminPostIncludeTags                  AdminPostInclude = "tags"
	AdminPostIncludeAuthors               AdminPostInclude = "authors"
	AdminPostIncludeAuthorsRoles          AdminPostInclude = "authors.roles"
	AdminPostIncludeEmail                 AdminPostInclude = "email"
	AdminPostIncludeTiers                 AdminPostInclude = "tiers"
	AdminPostIncludeNewsletter            AdminPostInclude = "newsletter"
	AdminPostIncludeCountConversions      AdminPostInclude = "count.conversions"
	AdminPostIncludeCountSignups          AdminPostInclude = "count.signups"
	AdminPostIncludeCountPaidConversions  AdminPostInclude = "count.paid_conversions"
	AdminPostIncludeCountClicks           AdminPostInclude = "count.clicks"
	AdminPostIncludeSentiment             AdminPostInclude = "sentiment"
	AdminPostIncludeCountPositiveFeedback AdminPostInclude = "count.positive_feedback"
	AdminPostIncludeCountNegativeFeedback AdminPostInclude = "count.negative_feedback"
	AdminPostIncludePostRevisions         AdminPostInclude = "post_revisions"
	AdminPostIncludePostRevisionsAuthor   AdminPostInclude = "post_revisions.author"
)

type AdminPageInclude string

const (
	AdminPageIncludeTags                 AdminPageInclude = "tags"
	AdminPageIncludeAuthors              AdminPageInclude = "authors"
	AdminPageIncludeAuthorsRoles         AdminPageInclude = "authors.roles"
	AdminPageIncludeTiers                AdminPageInclude = "tiers"
	AdminPageIncludeCountSignups         AdminPageInclude = "count.signups"
	AdminPageIncludeCountPaidConversions AdminPageInclude = "count.paid_conversions"
	AdminPageIncludePostRevisions        AdminPageInclude = "post_revisions"
	AdminPageIncludePostRevisionsAuthor  AdminPageInclude = "post_revisions.author"
)

type AuthorInclude string

const (
	AuthorIncludeCountPosts AuthorInclude = "count.posts"
)

type TagInclude string

const (
	TagIncludeCountPosts TagInclude = "count.posts"
)

type UserInclude string

const (
	UserIncludeCountPosts       UserInclude = "count.posts"
	UserIncludePermissions      UserInclude = "permissions"
	UserIncludeRoles            UserInclude = "roles"
	UserIncludeRolesPermissions UserInclude = "roles.permissions"
)

type NewsletterInclude string

const (
	NewsletterIncludeCountPosts         NewsletterInclude = "count.posts"
	NewsletterIncludeCountMembers       NewsletterInclude = "count.members"
	NewsletterIncludeCountActiveMembers NewsletterInclude = "count.active_members"
)

type MemberInclude string

const (
	MemberIncludeEmailRecipients MemberInclude = "email_recipients"
	MemberIncludeProducts        MemberInclude = "products"
	MemberIncludeTiers           MemberInclude = "tiers"
)

type CommonBrowseQueryParams struct {
	Fields []string `query:"fields,omitempty" doc:"Comma-separated fields to return"`
	Filter string   `query:"filter,omitempty" doc:"NQL filter expression for browse endpoints"`
	Limit  string   `query:"limit,omitempty" doc:"Number of records to return, or 'all'" default:"15"`
	Page   int      `query:"page,omitempty" minimum:"1" default:"1"`
	Order  string   `query:"order,omitempty" doc:"Order by expression"`
	Debug  *bool    `query:"debug,omitempty" doc:"Include debug information when supported"`
}

type CommonReadQueryParams struct {
	Fields []string `query:"fields,omitempty" doc:"Comma-separated fields to return"`
	Debug  *bool    `query:"debug,omitempty" doc:"Include debug information when supported"`
}

type ContentPostBrowseQueryParams struct {
	CommonBrowseQueryParams
	Include      []ContentPostInclude `query:"include,omitempty" doc:"Supported values: authors, tags, sentiment"`
	Formats      []string             `query:"formats,omitempty" doc:"Content API post output formats. Supported values: lexical, html, plaintext, mobiledoc." default:"html" enum:"lexical,html,plaintext,mobiledoc"`
	AbsoluteURLs *bool                `query:"absolute_urls,omitempty" doc:"Return absolute URLs instead of relative URLs where supported"`
	Collection   *string              `query:"collection,omitempty" doc:"Filter posts by collection slug"`
}

type ContentPostReadQueryParams struct {
	CommonReadQueryParams
	Include      []ContentPostInclude `query:"include,omitempty" doc:"Supported values: authors, tags, sentiment"`
	Formats      []string             `query:"formats,omitempty" doc:"Content API post output formats. Supported values: lexical, html, plaintext, mobiledoc." default:"html" enum:"lexical,html,plaintext,mobiledoc"`
	AbsoluteURLs *bool                `query:"absolute_urls,omitempty" doc:"Return absolute URLs instead of relative URLs where supported"`
}

type ContentPageBrowseQueryParams struct {
	CommonBrowseQueryParams
	Include      []ContentPageInclude `query:"include,omitempty" doc:"Supported values: authors, tags"`
	Formats      []string             `query:"formats,omitempty" doc:"Content API page output formats. Supported values: lexical, html, plaintext, mobiledoc." default:"html" enum:"lexical,html,plaintext,mobiledoc"`
	AbsoluteURLs *bool                `query:"absolute_urls,omitempty" doc:"Return absolute URLs instead of relative URLs where supported"`
}

type ContentPageReadQueryParams struct {
	CommonReadQueryParams
	Include      []ContentPageInclude `query:"include,omitempty" doc:"Supported values: authors, tags"`
	Formats      []string             `query:"formats,omitempty" doc:"Content API page output formats. Supported values: lexical, html, plaintext, mobiledoc." default:"html" enum:"lexical,html,plaintext,mobiledoc"`
	AbsoluteURLs *bool                `query:"absolute_urls,omitempty" doc:"Return absolute URLs instead of relative URLs where supported"`
}

type AdminPostBrowseQueryParams struct {
	CommonBrowseQueryParams
	Include      []AdminPostInclude `query:"include,omitempty" doc:"Supported values: tags, authors, authors.roles, email, tiers, newsletter, count.conversions, count.signups, count.paid_conversions, count.clicks, sentiment, count.positive_feedback, count.negative_feedback, post_revisions, post_revisions.author"`
	Formats      []string           `query:"formats,omitempty" doc:"Admin API post output formats. Supported values: lexical, html, plaintext, mobiledoc. Ghost defaults to lexical and mobiledoc." enum:"lexical,html,plaintext,mobiledoc"`
	Collection   *string            `query:"collection,omitempty" doc:"Filter posts by collection slug"`
	AbsoluteURLs *bool              `query:"absolute_urls,omitempty" doc:"Return absolute URLs instead of relative URLs where supported"`
}

type AdminPostReadQueryParams struct {
	CommonReadQueryParams
	Include      []AdminPostInclude `query:"include,omitempty" doc:"Supported values: tags, authors, authors.roles, email, tiers, newsletter, count.conversions, count.signups, count.paid_conversions, count.clicks, sentiment, count.positive_feedback, count.negative_feedback, post_revisions, post_revisions.author"`
	Formats      []string           `query:"formats,omitempty" doc:"Admin API post output formats. Supported values: lexical, html, plaintext, mobiledoc. Ghost defaults to lexical and mobiledoc." enum:"lexical,html,plaintext,mobiledoc"`
	AbsoluteURLs *bool              `query:"absolute_urls,omitempty" doc:"Return absolute URLs instead of relative URLs where supported"`
}

type AdminPageBrowseQueryParams struct {
	CommonBrowseQueryParams
	Include      []AdminPageInclude `query:"include,omitempty" doc:"Supported values: tags, authors, authors.roles, tiers, count.signups, count.paid_conversions, post_revisions, post_revisions.author"`
	Formats      []string           `query:"formats,omitempty" doc:"Admin API page output formats. Supported values: lexical, html, plaintext, mobiledoc. Ghost defaults to lexical and mobiledoc." enum:"lexical,html,plaintext,mobiledoc"`
	AbsoluteURLs *bool              `query:"absolute_urls,omitempty" doc:"Return absolute URLs instead of relative URLs where supported"`
}

type AdminPageReadQueryParams struct {
	CommonReadQueryParams
	Include      []AdminPageInclude `query:"include,omitempty" doc:"Supported values: tags, authors, authors.roles, tiers, count.signups, count.paid_conversions, post_revisions, post_revisions.author"`
	Formats      []string           `query:"formats,omitempty" doc:"Admin API page output formats. Supported values: lexical, html, plaintext, mobiledoc. Ghost defaults to lexical and mobiledoc." enum:"lexical,html,plaintext,mobiledoc"`
	AbsoluteURLs *bool              `query:"absolute_urls,omitempty" doc:"Return absolute URLs instead of relative URLs where supported"`
}

type AuthorBrowseQueryParams struct {
	CommonBrowseQueryParams
	Include []AuthorInclude `query:"include,omitempty" doc:"Supported values: count.posts"`
}

type AuthorReadQueryParams struct {
	CommonReadQueryParams
	Include []AuthorInclude `query:"include,omitempty" doc:"Supported values: count.posts"`
	Filter  string          `query:"filter,omitempty" doc:"Optional NQL filter expression"`
}

type TagBrowseQueryParams struct {
	CommonBrowseQueryParams
	Include []TagInclude `query:"include,omitempty" doc:"Supported values: count.posts"`
}

type TagReadQueryParams struct {
	CommonReadQueryParams
	Include []TagInclude `query:"include,omitempty" doc:"Supported values: count.posts"`
	Filter  string       `query:"filter,omitempty" doc:"Optional NQL filter expression"`
}

type UserBrowseQueryParams struct {
	CommonBrowseQueryParams
	Include []UserInclude `query:"include,omitempty" doc:"Supported values: count.posts, permissions, roles, roles.permissions"`
}

type UserReadQueryParams struct {
	CommonReadQueryParams
	Include []UserInclude `query:"include,omitempty" doc:"Supported values: count.posts, permissions, roles, roles.permissions"`
}

type NewsletterBrowseQueryParams struct {
	CommonBrowseQueryParams
	Include []NewsletterInclude `query:"include,omitempty" doc:"Supported values: count.posts, count.members, count.active_members"`
}

type NewsletterReadQueryParams struct {
	CommonReadQueryParams
	Include []NewsletterInclude `query:"include,omitempty" doc:"Supported values: count.posts, count.members, count.active_members"`
}

type MemberBrowseQueryParams struct {
	CommonBrowseQueryParams
	Include []MemberInclude `query:"include,omitempty" doc:"Supported values: email_recipients, products, tiers"`
	Search  string          `query:"search,omitempty" doc:"Free-text member search query"`
}

type MemberReadQueryParams struct {
	CommonReadQueryParams
	Include []MemberInclude `query:"include,omitempty" doc:"Supported values: email_recipients, products, tiers"`
}

// Path parameter types

type IDPathParam struct {
	ID string `path:"id" maxLength:"24" doc:"Resource ID"`
}

type SlugPathParam struct {
	Slug string `path:"slug" maxLength:"191" doc:"Resource slug"`
}

type EmailPathParam struct {
	Email string `path:"email" maxLength:"191" doc:"Resource email"`
}

type EmptyInput struct{}

type NotificationIDPathParam struct {
	NotificationID string `path:"notification_id" maxLength:"24"`
}

type NamePathParam struct {
	Name string `path:"name" maxLength:"191"`
}

type KeyIDPathParam struct {
	KeyID string `path:"keyid" maxLength:"24"`
}

type PostIDPathParam struct {
	PostID string `path:"post_id" maxLength:"24"`
}

type ResourceIDPathParam struct {
	Resource string `path:"resource" maxLength:"50"`
	ID       string `path:"id" maxLength:"24"`
}

type TypeNamePathParam struct {
	Type string `path:"type" maxLength:"50"`
	Name string `path:"name" maxLength:"191"`
}

type TypeNameIDPathParam struct {
	Type string `path:"type" maxLength:"50"`
	Name string `path:"name" maxLength:"191"`
	ID   string `path:"id" maxLength:"24"`
}

type IntegrationRefreshKeyInput struct {
	IDPathParam
	KeyIDPathParam
}

type SchedulePublishInput struct {
	ResourceIDPathParam
}

type GenerateSlugInput struct {
	TypeNamePathParam
}

type GenerateSlugByIDInput struct {
	TypeNameIDPathParam
}

type CommentByPostInput struct {
	PostIDPathParam
}

type ContentPostsBrowseInput struct {
	ContentPostBrowseQueryParams
}

type ContentPostReadByIDInput struct {
	IDPathParam
	ContentPostReadQueryParams
}

type ContentPostReadBySlugInput struct {
	SlugPathParam
	ContentPostReadQueryParams
}

type ContentPagesBrowseInput struct {
	ContentPageBrowseQueryParams
}

type ContentPageReadByIDInput struct {
	IDPathParam
	ContentPageReadQueryParams
}

type ContentPageReadBySlugInput struct {
	SlugPathParam
	ContentPageReadQueryParams
}

type AdminPostsBrowseInput struct {
	AdminPostBrowseQueryParams
}

type AdminPostReadByIDInput struct {
	IDPathParam
	AdminPostReadQueryParams
}

type AdminPostReadBySlugInput struct {
	SlugPathParam
	AdminPostReadQueryParams
}

type AdminPagesBrowseInput struct {
	AdminPageBrowseQueryParams
}

type AdminPageReadByIDInput struct {
	IDPathParam
	AdminPageReadQueryParams
}

type AdminPageReadBySlugInput struct {
	SlugPathParam
	AdminPageReadQueryParams
}

type AuthorsBrowseInput struct {
	AuthorBrowseQueryParams
}

type AuthorReadByIDInput struct {
	IDPathParam
	AuthorReadQueryParams
}

type AuthorReadBySlugInput struct {
	SlugPathParam
	AuthorReadQueryParams
}

type TagsBrowseInput struct {
	TagBrowseQueryParams
}

type TagReadByIDInput struct {
	IDPathParam
	TagReadQueryParams
}

type TagReadBySlugInput struct {
	SlugPathParam
	TagReadQueryParams
}

type UsersBrowseInput struct {
	UserBrowseQueryParams
}

type UserReadByIDInput struct {
	IDPathParam
	UserReadQueryParams
}

type UserReadBySlugInput struct {
	SlugPathParam
	UserReadQueryParams
}

type UserReadByEmailInput struct {
	EmailPathParam
	UserReadQueryParams
}

type NewslettersBrowseInput struct {
	NewsletterBrowseQueryParams
}

type NewsletterReadByIDInput struct {
	IDPathParam
	NewsletterReadQueryParams
}

type MembersBrowseInput struct {
	MemberBrowseQueryParams
}

type MemberReadByIDInput struct {
	IDPathParam
	MemberReadQueryParams
}

type ReadByEmailInput struct {
	EmailPathParam
	CommonReadQueryParams
}

// Response metadata

type PaginationMeta struct {
	Page  int  `json:"page"`
	Limit int  `json:"limit"`
	Pages int  `json:"pages"`
	Total int  `json:"total"`
	Next  *int `json:"next"`
	Prev  *int `json:"prev"`
}

type BrowseMeta struct {
	Pagination PaginationMeta `json:"pagination"`
}

type PostCountMeta struct {
	Posts int `json:"posts"`
}

// Error types

type ContentErrorItem struct {
	Message   string `json:"message"`
	ErrorType string `json:"errorType"`
}

type ContentErrorBody struct {
	Errors []ContentErrorItem `json:"errors"`
}

// Reference types for nested resource associations

// SlugRef is a generic reference to a named resource identified by id/name/slug.
// Used for tags, labels, newsletters, and products in request bodies.
type SlugRef struct {
	ID   *string `json:"id,omitempty" maxLength:"24"`
	Name *string `json:"name,omitempty" maxLength:"191"`
	Slug *string `json:"slug,omitempty" maxLength:"191"`
}

type AuthorRef struct {
	ID    *string `json:"id,omitempty" maxLength:"24"`
	Slug  *string `json:"slug,omitempty" maxLength:"191"`
	Email *string `json:"email,omitempty" maxLength:"191"`
}

type CollectionRef struct {
	ID string `json:"id" maxLength:"24"`
}
