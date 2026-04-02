package schema

import "encoding/json"

type EmailResource struct {
	ID              string  `json:"id"`
	UUID            string  `json:"uuid"`
	Status          string  `json:"status"`
	RecipientFilter string  `json:"recipient_filter"`
	Error           *string `json:"error"`
	// ErrorData contains email-provider-specific error details when sending fails
	ErrorData      json.RawMessage `json:"error_data"`
	EmailCount     int             `json:"email_count"`
	DeliveredCount int             `json:"delivered_count"`
	OpenedCount    int             `json:"opened_count"`
	FailedCount    int             `json:"failed_count"`
	Subject        string          `json:"subject"`
	From           string          `json:"from"`
	ReplyTo        *string         `json:"reply_to"`
	Source         string          `json:"source"`
	HTML           *string         `json:"html"`
	Plaintext      *string         `json:"plaintext"`
	TrackOpens     bool            `json:"track_opens"`
	SubmittedAt    string          `json:"submitted_at"`
	CreatedAt      string          `json:"created_at"`
	UpdatedAt      string          `json:"updated_at"`
}

type EmailsBrowseInput struct {
	CommonBrowseQueryParams
}

type AdminEmailsOutput struct {
	Emails []EmailResource `json:"emails"`
	Meta   BrowseMeta      `json:"meta"`
}

type AdminEmailOutput struct {
	Emails []EmailResource `json:"emails"`
}

type AdminEmailBatchesOutput struct {
	Batches []AdminEmailBatchResource `json:"batches"`
	Meta    BrowseMeta                `json:"meta"`
}

type AdminEmailBatchResource struct {
	ID              string  `json:"id"`
	ProviderID      string  `json:"provider_id"`
	Status          string  `json:"status"`
	MemberSegment   string  `json:"member_segment"`
	CreatedAt       string  `json:"created_at"`
	UpdatedAt       string  `json:"updated_at"`
	ErrorStatusCode *string `json:"error_status_code"`
	ErrorMessage    *string `json:"error_message"`
	// ErrorData contains provider-specific error details (varies by email provider)
	ErrorData json.RawMessage `json:"error_data"`
	Count     struct {
		Recipients int `json:"recipients"`
	} `json:"count"`
}

type AdminEmailFailuresOutput struct {
	Failures []AdminEmailFailureResource `json:"failures"`
	Meta     BrowseMeta                  `json:"meta"`
}

type EmailFailureMemberResource struct {
	ID    string  `json:"id"`
	UUID  string  `json:"uuid"`
	Email string  `json:"email"`
	Name  *string `json:"name"`
}

type AdminEmailFailureResource struct {
	ID           string                      `json:"id"`
	Code         string                      `json:"code"`
	EnhancedCode *string                     `json:"enhanced_code"`
	Message      string                      `json:"message"`
	Severity     string                      `json:"severity"`
	FailedAt     string                      `json:"failed_at"`
	EventID      string                      `json:"event_id"`
	Member       *EmailFailureMemberResource `json:"member,omitempty"`
}

type AdminEmailAnalyticsStatusOutput struct {
	Status string `json:"status"`
}
