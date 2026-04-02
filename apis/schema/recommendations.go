package schema

// BaseRecommendationResource contains the fields shared by both admin and
// content API recommendation resources.
type BaseRecommendationResource struct {
	ID                string  `json:"id"`
	Title             string  `json:"title"`
	Description       *string `json:"description"`
	Excerpt           *string `json:"excerpt"`
	FeaturedImage     *string `json:"featured_image"`
	Favicon           *string `json:"favicon"`
	URL               string  `json:"url"`
	OneClickSubscribe bool    `json:"one_click_subscribe"`
	CreatedAt         string  `json:"created_at"`
	UpdatedAt         *string `json:"updated_at"`
}

type RecommendationResource struct {
	BaseRecommendationResource
}

type ContentRecommendationsBrowseInput struct {
	CommonBrowseQueryParams
}

type ContentRecommendationsOutput struct {
	Recommendations []RecommendationResource `json:"recommendations"`
	Meta            BrowseMeta               `json:"meta"`
}

type RecommendationCountMeta struct {
	ClickCount      int `json:"clicks"`
	SubscriberCount int `json:"subscribers"`
}

type AdminRecommendationResource struct {
	BaseRecommendationResource
	Count *RecommendationCountMeta `json:"count,omitempty"`
}

type AdminRecommendationsBrowseInput struct {
	CommonBrowseQueryParams
}

type AdminIncomingRecommendationsBrowseInput struct {
	CommonBrowseQueryParams
}

type AdminRecommendationsOutput struct {
	Recommendations []AdminRecommendationResource `json:"recommendations"`
	Meta            BrowseMeta                    `json:"meta"`
}

type AdminRecommendationOutput struct {
	Recommendations []AdminRecommendationResource `json:"recommendations"`
}

type CreateRecommendationBody struct {
	URL               string  `json:"url"`
	Title             *string `json:"title,omitempty"`
	Description       *string `json:"description,omitempty"`
	Excerpt           *string `json:"excerpt,omitempty"`
	FeaturedImage     *string `json:"featured_image,omitempty"`
	Favicon           *string `json:"favicon,omitempty"`
	OneClickSubscribe *bool   `json:"one_click_subscribe,omitempty"`
}

type CreateRecommendationInput struct {
	Body struct {
		Recommendations []CreateRecommendationBody `json:"recommendations"`
	}
}

type UpdateRecommendationBody struct {
	Title             *string `json:"title,omitempty"`
	Description       *string `json:"description,omitempty"`
	Excerpt           *string `json:"excerpt,omitempty"`
	FeaturedImage     *string `json:"featured_image,omitempty"`
	Favicon           *string `json:"favicon,omitempty"`
	URL               *string `json:"url,omitempty"`
	OneClickSubscribe *bool   `json:"one_click_subscribe,omitempty"`
}

type UpdateRecommendationInput struct {
	IDPathParam
	Body struct {
		Recommendations []UpdateRecommendationBody `json:"recommendations"`
	}
}

type CheckRecommendationInput struct {
	Body struct {
		Recommendations []struct {
			URL string `json:"url"`
		} `json:"recommendations"`
	}
}

type AdminIncomingRecommendationsOutput struct {
	Recommendations []AdminIncomingRecommendationResource `json:"recommendations"`
	Meta            BrowseMeta                            `json:"meta"`
}

type AdminIncomingRecommendationResource struct {
	ID               string  `json:"id"`
	Title            string  `json:"title"`
	Excerpt          *string `json:"excerpt"`
	FeaturedImage    *string `json:"featured_image"`
	Favicon          *string `json:"favicon"`
	URL              string  `json:"url"`
	RecommendingBack bool    `json:"recommending_back"`
	CreatedAt        string  `json:"created_at"`
	UpdatedAt        *string `json:"updated_at"`
}
