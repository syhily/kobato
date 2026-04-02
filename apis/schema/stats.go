package schema

import "encoding/json"

type StatsDateFromParams struct {
	DateFrom string `query:"date_from,omitempty" doc:"Start date for stats range (ISO 8601)"`
}

type StatsDateRangeParams struct {
	DateFrom string `query:"date_from,omitempty" doc:"Start date for stats range (ISO 8601)"`
	DateTo   string `query:"date_to,omitempty" doc:"End date for stats range (ISO 8601)"`
}

type StatsCommonRangeParams struct {
	Order    string `query:"order,omitempty" doc:"Order expression"`
	Limit    string `query:"limit,omitempty" doc:"Number of results to return"`
	DateFrom string `query:"date_from,omitempty" doc:"Start date (ISO 8601)"`
	DateTo   string `query:"date_to,omitempty" doc:"End date (ISO 8601)"`
	Timezone string `query:"timezone,omitempty" doc:"Timezone for date calculations"`
}

type StatsMemberCountInput struct {
	StatsDateFromParams
}

type StatsMRRInput struct {
	StatsDateFromParams
}

type StatsSubscriptionsInput struct{}

type StatsReferrersInput struct{}

type StatsTopContentInput struct {
	DateFrom     string `query:"date_from,omitempty" doc:"Start date (ISO 8601)"`
	DateTo       string `query:"date_to,omitempty" doc:"End date (ISO 8601)"`
	Timezone     string `query:"timezone,omitempty" doc:"Timezone for date calculations"`
	MemberStatus string `query:"member_status,omitempty" doc:"Filter by member status"`
	PostType     string `query:"post_type,omitempty" doc:"Filter by post type"`
	PostUUID     string `query:"post_uuid,omitempty" doc:"Filter by post UUID"`
	Pathname     string `query:"pathname,omitempty" doc:"Filter by pathname"`
	Device       string `query:"device,omitempty" doc:"Filter by device type"`
	Location     string `query:"location,omitempty" doc:"Filter by location"`
	Source       string `query:"source,omitempty" doc:"Filter by traffic source"`
	UtmSource    string `query:"utm_source,omitempty" doc:"Filter by UTM source"`
	UtmMedium    string `query:"utm_medium,omitempty" doc:"Filter by UTM medium"`
	UtmCampaign  string `query:"utm_campaign,omitempty" doc:"Filter by UTM campaign"`
	UtmContent   string `query:"utm_content,omitempty" doc:"Filter by UTM content"`
	UtmTerm      string `query:"utm_term,omitempty" doc:"Filter by UTM term"`
}

type StatsTopPostsInput struct {
	StatsCommonRangeParams
	PostType string `query:"post_type,omitempty" doc:"Filter by post type"`
}

type StatsTopPostsViewsInput struct {
	StatsCommonRangeParams
}

type StatsNewsletterStatsInput struct {
	StatsCommonRangeParams
	NewsletterID string `query:"newsletter_id,omitempty" doc:"Filter by newsletter ID"`
}

type StatsNewsletterClickInput struct {
	NewsletterID string `query:"newsletter_id,omitempty" doc:"Filter by newsletter ID"`
	PostIDs      string `query:"post_ids,omitempty" doc:"Comma-separated post IDs"`
}

type StatsSubscriberCountInput struct {
	StatsDateRangeParams
	NewsletterID string `query:"newsletter_id,omitempty" doc:"Filter by newsletter ID"`
}

type StatsPostReferrersInput struct {
	IDPathParam
	StatsCommonRangeParams
}

type StatsPostGrowthInput struct {
	IDPathParam
}

type StatsPostStatsInput struct {
	IDPathParam
}

type StatsPostsVisitorCountsInput struct {
	Body struct {
		PostUUIDs []string `json:"post_uuids" minItems:"1"`
	}
}

type StatsPostsMemberCountsInput struct {
	Body struct {
		PostIDs []string `json:"post_ids" minItems:"1"`
	}
}

type StatsTopSourcesGrowthInput struct {
	StatsCommonRangeParams
	MemberStatus string `query:"member_status,omitempty" doc:"Filter by member status"`
}

type MemberCountDataPoint struct {
	Date   string `json:"date"`
	Paid   int    `json:"paid"`
	Free   int    `json:"free"`
	Comped int    `json:"comped"`
}

type MemberCountStatsOutput struct {
	Resource string                 `json:"resource"`
	Total    int                    `json:"total,omitempty"`
	Data     []MemberCountDataPoint `json:"data,omitempty"`
}

type MemberMRRCurrencyData struct {
	Date  string `json:"date"`
	Value int    `json:"value"`
}

type MemberMRREntry struct {
	Currency string                  `json:"currency"`
	Data     []MemberMRRCurrencyData `json:"data"`
}

type MemberMRRStatsOutput struct {
	Resource string           `json:"resource"`
	Data     []MemberMRREntry `json:"data,omitempty"`
}

type MemberStatsQueryParams struct {
	Days int `query:"days,omitempty" doc:"Number of days to look back"`
}

type MemberCountStatsInput struct {
	MemberStatsQueryParams
}

type MemberMRRStatsInput struct {
	MemberStatsQueryParams
}

type AdminStatsSeriesPoint struct {
	Date string `json:"date"`
}

// AdminStatsOutput wraps various stats endpoints. The shape of each element
// in Stats and the Meta object depends on the specific stats endpoint called.
// Common patterns:
//
//	member_count: Stats=[{"date":"...","paid":N,"free":N,"comped":N}] Meta={"totals":{...}}
//	mrr: Stats=[{"date":"...","mrr":N,"currency":"..."}] Meta={"totals":[...]}
//	referrers: Stats=[{"source":"...","free_members":N,"paid_members":N}]
//	top content: Stats=[{"url":"...","visits":N}]
type AdminStatsOutput struct {
	Stats []json.RawMessage `json:"stats"`
	Meta  json.RawMessage   `json:"meta,omitempty"`
}

type FeedbackBrowseInput struct {
	IDPathParam
	CommonBrowseQueryParams
}

type AdminFeedbackEntry struct {
	ID        string `json:"id"`
	PostID    string `json:"post_id"`
	MemberID  string `json:"member_id"`
	Score     int    `json:"score"`
	CreatedAt string `json:"created_at"`
}

type AdminFeedbackOutput struct {
	Feedback []AdminFeedbackEntry `json:"feedback"`
	Meta     BrowseMeta           `json:"meta"`
}
