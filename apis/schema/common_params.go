package schema

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

// Composite path parameter input types

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

// Input composition types — combine path params with query params

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
