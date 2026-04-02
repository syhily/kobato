package schema

type AdminIntegrationsOutput struct {
	Integrations []AdminIntegrationResource `json:"integrations"`
	Meta         BrowseMeta                 `json:"meta"`
}

type APIKeyResource struct {
	ID              string  `json:"id"`
	Type            string  `json:"type"`
	Secret          string  `json:"secret"`
	RoleID          *string `json:"role_id"`
	IntegrationID   *string `json:"integration_id"`
	UserID          *string `json:"user_id"`
	LastSeenAt      *string `json:"last_seen_at"`
	LastSeenVersion *string `json:"last_seen_version"`
	CreatedAt       string  `json:"created_at"`
	UpdatedAt       *string `json:"updated_at"`
}

type AdminIntegrationResource struct {
	ID          string            `json:"id"`
	Type        string            `json:"type"`
	Name        string            `json:"name"`
	Slug        string            `json:"slug"`
	IconImage   *string           `json:"icon_image"`
	Description *string           `json:"description"`
	CreatedAt   string            `json:"created_at"`
	UpdatedAt   *string           `json:"updated_at"`
	APIKeys     []APIKeyResource  `json:"api_keys,omitempty"`
	Webhooks    []WebhookResource `json:"webhooks,omitempty"`
}

type IntegrationInclude string

const (
	IntegrationIncludeAPIKeys  IntegrationInclude = "api_keys"
	IntegrationIncludeWebhooks IntegrationInclude = "webhooks"
)

type IntegrationBrowseQueryParams struct {
	CommonBrowseQueryParams
	Include []IntegrationInclude `query:"include,omitempty" doc:"Supported values: api_keys, webhooks"`
}

type IntegrationsBrowseInput struct {
	IntegrationBrowseQueryParams
}

type IntegrationReadInput struct {
	IDPathParam
	Include []IntegrationInclude `query:"include,omitempty" doc:"Supported values: api_keys, webhooks"`
}

type CreateIntegrationBody struct {
	Name        string              `json:"name"`
	IconImage   *string             `json:"icon_image,omitempty"`
	Description *string             `json:"description,omitempty"`
	Webhooks    []CreateWebhookBody `json:"webhooks,omitempty"`
}

type CreateIntegrationInput struct {
	Include []IntegrationInclude `query:"include,omitempty" doc:"Supported values: api_keys, webhooks"`
	Body    struct {
		Integrations []CreateIntegrationBody `json:"integrations"`
	}
}

type UpdateIntegrationBody struct {
	Name        *string             `json:"name,omitempty"`
	IconImage   *string             `json:"icon_image,omitempty"`
	Description *string             `json:"description,omitempty"`
	Webhooks    []CreateWebhookBody `json:"webhooks,omitempty"`
}

type UpdateIntegrationInput struct {
	IDPathParam
	Include []IntegrationInclude `query:"include,omitempty" doc:"Supported values: api_keys, webhooks"`
	Body    struct {
		Integrations []UpdateIntegrationBody `json:"integrations"`
	}
}

type AdminIntegrationOutput struct {
	Integrations []AdminIntegrationResource `json:"integrations"`
}
