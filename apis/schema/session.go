package schema

type SessionUserInfo struct {
	UserID string `json:"user_id"`
}

type AdminSessionOutput struct {
	Session []SessionUserInfo `json:"session"`
}

type AdminCreateSessionInput struct {
	Body struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
}

type AdminVerifySessionInput struct {
	Body struct {
		Token string `json:"token"`
	}
}

type PasswordResetMessage struct {
	Message string `json:"message"`
}

type InvitationMessage struct {
	Message string `json:"message"`
	Valid   bool   `json:"valid,omitempty"`
}

type SetupStatus struct {
	Status bool `json:"status"`
}

type AdminAuthenticationMessageOutput struct {
	PasswordReset []PasswordResetMessage `json:"password_reset,omitempty"`
	Invitation    []InvitationMessage    `json:"invitation,omitempty"`
	Setup         []SetupStatus          `json:"setup,omitempty"`
}
