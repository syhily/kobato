package schema

import "github.com/danielgtaylor/huma/v2"

type ImageUploadFormData struct {
	File    huma.FormFile `form:"file" required:"true"`
	Purpose string        `form:"purpose" default:"image" enum:"image,profile_image,icon"`
	Ref     string        `form:"ref"`
}

type ImageUploadInput struct {
	RawBody huma.MultipartFormFiles[ImageUploadFormData]
}

type ImageResource struct {
	URL string  `json:"url"`
	Ref *string `json:"ref"`
}

type ImageUploadOutput struct {
	Images []ImageResource `json:"images"`
}
