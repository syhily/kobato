package schema

type WebhookResource struct {
	ID                  string  `json:"id"`
	Event               string  `json:"event"`
	TargetURL           string  `json:"target_url"`
	Name                *string `json:"name"`
	Secret              *string `json:"secret"`
	APIVersion          *string `json:"api_version"`
	IntegrationID       *string `json:"integration_id"`
	Status              *string `json:"status"`
	LastTriggeredAt     *string `json:"last_triggered_at"`
	LastTriggeredStatus *string `json:"last_triggered_status"`
	LastTriggeredError  *string `json:"last_triggered_error"`
	CreatedAt           string  `json:"created_at"`
	UpdatedAt           *string `json:"updated_at"`
}

type CreateWebhookBody struct {
	Event         string  `json:"event" maxLength:"50" pattern:"^[a-z_.]+$"`
	TargetURL     string  `json:"target_url" maxLength:"2000"`
	Name          *string `json:"name,omitempty" maxLength:"191"`
	Secret        *string `json:"secret,omitempty" maxLength:"191"`
	APIVersion    *string `json:"api_version,omitempty" maxLength:"50"`
	IntegrationID *string `json:"integration_id,omitempty" maxLength:"24"`
}

type CreateWebhookInput struct {
	Body struct {
		Webhooks []CreateWebhookBody `json:"webhooks" minItems:"1" maxItems:"1"`
	}
}

type UpdateWebhookBody struct {
	Event      *string `json:"event,omitempty" maxLength:"50" pattern:"^[a-z_.]+$"`
	TargetURL  *string `json:"target_url,omitempty" maxLength:"2000"`
	Name       *string `json:"name,omitempty" maxLength:"191"`
	Secret     *string `json:"secret,omitempty" maxLength:"191"`
	APIVersion *string `json:"api_version,omitempty" maxLength:"50"`
}

type UpdateWebhookInput struct {
	IDPathParam
	Body struct {
		Webhooks []UpdateWebhookBody `json:"webhooks" minItems:"1" maxItems:"1"`
	}
}

type WebhookOutput struct {
	Webhooks []WebhookResource `json:"webhooks"`
}
