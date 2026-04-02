package schema

type AdminSnippetsOutput struct {
	Snippets []AdminSnippetResource `json:"snippets"`
	Meta     BrowseMeta             `json:"meta"`
}

type AdminSnippetOutput struct {
	Snippets []AdminSnippetResource `json:"snippets"`
}

type AdminSnippetResource struct {
	ID        string  `json:"id"`
	Name      string  `json:"name"`
	Mobiledoc string  `json:"mobiledoc"`
	Lexical   *string `json:"lexical"`
	CreatedAt string  `json:"created_at"`
	UpdatedAt string  `json:"updated_at"`
}

type SnippetBrowseQueryParams struct {
	CommonBrowseQueryParams
	Formats []string `query:"formats,omitempty" doc:"Output formats. Supported values: mobiledoc, lexical." enum:"mobiledoc,lexical"`
}

type SnippetsBrowseInput struct {
	SnippetBrowseQueryParams
}

type SnippetReadInput struct {
	IDPathParam
	Formats []string `query:"formats,omitempty" doc:"Output formats. Supported values: mobiledoc, lexical." enum:"mobiledoc,lexical"`
}

type CreateSnippetBody struct {
	Name      string  `json:"name" minLength:"1" maxLength:"191"`
	Mobiledoc string  `json:"mobiledoc" maxLength:"1000000000"`
	Lexical   *string `json:"lexical,omitempty" maxLength:"1000000000"`
}

type CreateSnippetInput struct {
	Formats []string `query:"formats,omitempty" doc:"Output formats." enum:"mobiledoc,lexical"`
	Body    struct {
		Snippets []CreateSnippetBody `json:"snippets" minItems:"1" maxItems:"1"`
	}
}

type UpdateSnippetBody struct {
	Name      *string `json:"name,omitempty" maxLength:"191"`
	Mobiledoc *string `json:"mobiledoc,omitempty" maxLength:"1000000000"`
	Lexical   *string `json:"lexical,omitempty" maxLength:"1000000000"`
}

type UpdateSnippetInput struct {
	IDPathParam
	Formats []string `query:"formats,omitempty" doc:"Output formats." enum:"mobiledoc,lexical"`
	Body    struct {
		Snippets []UpdateSnippetBody `json:"snippets" minItems:"1" maxItems:"1"`
	}
}
