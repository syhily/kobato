package schema

import "encoding/json"

type AdminThemesOutput struct {
	Themes []AdminThemeResource `json:"themes"`
}

type AdminThemeResource struct {
	Name      string            `json:"name"`
	Package   *ThemePackageInfo `json:"package,omitempty"`
	Active    bool              `json:"active"`
	Templates []ThemeTemplate   `json:"templates,omitempty"`
	Warnings  []ThemeMessage    `json:"warnings,omitempty"`
	Errors    []ThemeMessage    `json:"errors,omitempty"`
}

type ThemePackageInfo struct {
	Name        *string          `json:"name,omitempty"`
	Description *string          `json:"description,omitempty"`
	Version     *string          `json:"version,omitempty"`
	Engines     *ThemeEngines    `json:"engines,omitempty"`
	License     *string          `json:"license,omitempty"`
	Screenshots *ThemeScreenshot `json:"screenshots,omitempty"`
	Author      *ThemeAuthor     `json:"author,omitempty"`
}

type ThemeEngines struct {
	Ghost *string `json:"ghost,omitempty"`
}

type ThemeScreenshot struct {
	Desktop *string `json:"desktop,omitempty"`
}

type ThemeAuthor struct {
	Name  *string `json:"name,omitempty"`
	Email *string `json:"email,omitempty"`
	URL   *string `json:"url,omitempty"`
}

type ThemeTemplate struct {
	Filename string `json:"filename"`
	For      string `json:"for"`
	Slug     string `json:"slug"`
}

type ThemeMessage struct {
	Code    string  `json:"code"`
	Message string  `json:"message"`
	Details *string `json:"details,omitempty"`
	Level   string  `json:"level"`
	Rule    string  `json:"rule"`
}

type ThemeInstallInput struct {
	Source string `query:"source" doc:"Theme source. Supported values: github" enum:"github"`
	Ref    string `query:"ref" doc:"Theme reference (e.g., GitHub repo ref)"`
}

type ThemeActivateInput struct {
	NamePathParam
}

type AdminCustomThemeSettingsOutput struct {
	CustomThemeSettings []AdminCustomThemeSettingResource `json:"custom_theme_settings"`
}

type AdminCustomThemeSettingResource struct {
	Type string `json:"type"`
	ID   string `json:"id"`
	Key  string `json:"key"`
	// Value type depends on Type:
	//   "color": JSON string ("#rrggbb")
	//   "boolean": JSON boolean
	//   "select": JSON string (one of the option values)
	//   "image": JSON string (URL)
	//   "text": JSON string
	Value json.RawMessage `json:"value"`
}

type CustomThemeSettingsEditInput struct {
	Body struct {
		CustomThemeSettings []AdminCustomThemeSettingResource `json:"custom_theme_settings"`
	}
}
