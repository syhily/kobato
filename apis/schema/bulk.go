package schema

type AdminCSVExportOutput struct {
	ContentType        string `header:"Content-Type"`
	ContentDisposition string `header:"Content-Disposition"`
	Body               []byte
}

type AdminBulkStats struct {
	Successful   int `json:"successful"`
	Unsuccessful int `json:"unsuccessful"`
}

type AdminBulkMeta struct {
	Stats            *AdminBulkStats `json:"stats,omitempty"`
	Errors           []string        `json:"errors,omitempty"`
	UnsuccessfulData []string        `json:"unsuccessfulData,omitempty"`
}

type AdminBulkActionOutput struct {
	Bulk struct {
		Action *string        `json:"action,omitempty"`
		Meta   *AdminBulkMeta `json:"meta,omitempty"`
	} `json:"bulk"`
}

type AdminMemberBulkDestroyMeta struct {
	Stats           *AdminBulkStats `json:"stats,omitempty"`
	Errors          []string        `json:"errors,omitempty"`
	UnsuccessfulIDs []string        `json:"unsuccessfulIds,omitempty"`
}

type AdminMemberBulkDestroyOutput struct {
	Meta *AdminMemberBulkDestroyMeta `json:"meta,omitempty"`
}

type AdminPostExportInput struct {
	Limit  string `query:"limit,omitempty"`
	Filter string `query:"filter,omitempty"`
	Order  string `query:"order,omitempty"`
}

type AdminPostBulkDeleteInput struct {
	Filter string `query:"filter,omitempty"`
}

type BulkEditMeta struct {
	Tags       []SlugRef `json:"tags,omitempty"`
	Labels     []SlugRef `json:"labels,omitempty"`
	Newsletter *SlugRef  `json:"newsletter,omitempty"`
}

type AdminBulkActionBody struct {
	Action string        `json:"action"`
	Meta   *BulkEditMeta `json:"meta,omitempty"`
}

type AdminPostBulkEditInput struct {
	Filter string `query:"filter,omitempty"`
	Body   struct {
		Bulk AdminBulkActionBody `json:"bulk"`
	}
}

type AdminPageBulkDeleteInput struct {
	Filter string `query:"filter,omitempty"`
}

type AdminPageBulkEditInput struct {
	Filter string `query:"filter,omitempty"`
	Body   struct {
		Bulk AdminBulkActionBody `json:"bulk"`
	}
}

type AdminMemberBulkDeleteInput struct {
	All    bool   `query:"all,omitempty"`
	Filter string `query:"filter,omitempty"`
	Search string `query:"search,omitempty"`
}

type AdminMemberBulkEditInput struct {
	All    bool   `query:"all,omitempty"`
	Filter string `query:"filter,omitempty"`
	Search string `query:"search,omitempty"`
	Body   struct {
		Bulk AdminBulkActionBody `json:"bulk"`
	}
}
