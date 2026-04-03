package schema

type DBExportMeta struct {
	ExportedOn int64  `json:"exported_on"`
	Version    string `json:"version"`
}

type DBResource struct {
	Meta DBExportMeta `json:"meta"`
}

type AdminDBOutput struct {
	DB []DBResource `json:"db"`
}
