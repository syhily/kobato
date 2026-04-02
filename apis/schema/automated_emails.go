package schema

type AdminAutomatedEmailResource struct {
	ID                   string  `json:"id"`
	Status               string  `json:"status" enum:"active,inactive"`
	Name                 string  `json:"name"`
	Slug                 string  `json:"slug"`
	Subject              string  `json:"subject"`
	Lexical              *string `json:"lexical"`
	SenderName           *string `json:"sender_name"`
	SenderEmail          *string `json:"sender_email"`
	SenderReplyTo        *string `json:"sender_reply_to"`
	EmailDesignSettingID string  `json:"email_design_setting_id"`
	CreatedAt            string  `json:"created_at"`
	UpdatedAt            *string `json:"updated_at"`
}

type AdminAutomatedEmailsOutput struct {
	AutomatedEmails []AdminAutomatedEmailResource `json:"automated_emails"`
	Meta            BrowseMeta                    `json:"meta"`
}

type AdminAutomatedEmailOutput struct {
	AutomatedEmails []AdminAutomatedEmailResource `json:"automated_emails"`
}

type CreateAutomatedEmailBody struct {
	Name          string  `json:"name"`
	Subject       string  `json:"subject"`
	Lexical       *string `json:"lexical,omitempty"`
	SenderName    *string `json:"sender_name,omitempty"`
	SenderEmail   *string `json:"sender_email,omitempty"`
	SenderReplyTo *string `json:"sender_reply_to,omitempty"`
}

type CreateAutomatedEmailInput struct {
	Body struct {
		AutomatedEmails []CreateAutomatedEmailBody `json:"automated_emails"`
	}
}

type UpdateAutomatedEmailBody struct {
	Status        *string `json:"status,omitempty" enum:"active,inactive"`
	Name          *string `json:"name,omitempty"`
	Subject       *string `json:"subject,omitempty"`
	Lexical       *string `json:"lexical,omitempty"`
	SenderName    *string `json:"sender_name,omitempty"`
	SenderEmail   *string `json:"sender_email,omitempty"`
	SenderReplyTo *string `json:"sender_reply_to,omitempty"`
}

type UpdateAutomatedEmailInput struct {
	IDPathParam
	Body struct {
		AutomatedEmails []UpdateAutomatedEmailBody `json:"automated_emails"`
	}
}

type TestAutomatedEmailInput struct {
	IDPathParam
	Body struct {
		Email   string  `json:"email"`
		Subject *string `json:"subject,omitempty"`
		Lexical *string `json:"lexical,omitempty"`
	}
}
