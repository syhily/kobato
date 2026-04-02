package schema

type AdminNotificationsOutput struct {
	Notifications []AdminNotificationResource `json:"notifications"`
}

type AdminNotificationResource struct {
	ID          string   `json:"id"`
	Dismissible bool     `json:"dismissible"`
	Location    string   `json:"location"`
	Status      string   `json:"status"`
	Type        string   `json:"type"`
	Message     string   `json:"message"`
	Custom      bool     `json:"custom"`
	CreatedAt   string   `json:"createdAt"`
	Seen        bool     `json:"seen"`
	AddedAt     string   `json:"addedAt"`
	SeenBy      []string `json:"seenBy,omitempty"`
}

type CreateNotificationBody struct {
	Type        string  `json:"type"`
	Message     string  `json:"message"`
	Custom      *bool   `json:"custom,omitempty"`
	Dismissible *bool   `json:"dismissible,omitempty"`
	Location    *string `json:"location,omitempty"`
	Status      *string `json:"status,omitempty"`
}

type CreateNotificationInput struct {
	Body struct {
		Notifications []CreateNotificationBody `json:"notifications"`
	}
}
