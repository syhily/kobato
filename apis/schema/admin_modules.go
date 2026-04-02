package schema

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
