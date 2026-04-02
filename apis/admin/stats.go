package admin

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/syhily/kobato/apis/schema"
)

func addStatsRoutes(api huma.API) {
	memberCountOp := huma.Operation{
		OperationID: "admin-list-stats-member-count",
		Method:      http.MethodGet,
		Path:        "/stats/member_count",
		Summary:     "Get member count history",
		Description: "Get historical member count data over time, broken down by status (free, paid, comped).",
		Tags:        []string{"Stats"},
	}
	huma.Register(api, memberCountOp, func(_ context.Context, _ *schema.StatsMemberCountInput) (*schema.AdminStatsOutput, error) {
		return &schema.AdminStatsOutput{}, nil
	})

	mrrOp := huma.Operation{
		OperationID: "admin-list-stats-mrr",
		Method:      http.MethodGet,
		Path:        "/stats/mrr",
		Summary:     "Get MRR stats",
		Description: "Get monthly recurring revenue statistics over time, including breakdowns by currency.",
		Tags:        []string{"Stats"},
	}
	huma.Register(api, mrrOp, func(_ context.Context, _ *schema.StatsMRRInput) (*schema.AdminStatsOutput, error) {
		return &schema.AdminStatsOutput{}, nil
	})

	subscriptionsOp := huma.Operation{
		OperationID: "admin-list-stats-subscriptions",
		Method:      http.MethodGet,
		Path:        "/stats/subscriptions",
		Summary:     "Get subscription stats",
		Description: "Get subscription statistics over time, including new, canceled, and active subscription counts.",
		Tags:        []string{"Stats"},
	}
	huma.Register(api, subscriptionsOp, func(_ context.Context, _ *schema.StatsSubscriptionsInput) (*schema.AdminStatsOutput, error) {
		return &schema.AdminStatsOutput{}, nil
	})

	referrersOp := huma.Operation{
		OperationID: "admin-list-stats-referrers",
		Method:      http.MethodGet,
		Path:        "/stats/referrers",
		Summary:     "Get referrer stats",
		Description: "Get referrer statistics showing which sources are driving member signups and subscriptions.",
		Tags:        []string{"Stats"},
	}
	huma.Register(api, referrersOp, func(_ context.Context, _ *schema.StatsReferrersInput) (*schema.AdminStatsOutput, error) {
		return &schema.AdminStatsOutput{}, nil
	})

	topPostsOp := huma.Operation{
		OperationID: "admin-list-stats-top-posts",
		Method:      http.MethodGet,
		Path:        "/stats/top-posts",
		Summary:     "Get top posts stats",
		Description: "Get the top performing posts ranked by email opens, clicks, or feedback.",
		Tags:        []string{"Stats"},
	}
	huma.Register(api, topPostsOp, func(_ context.Context, _ *schema.StatsTopPostsInput) (*schema.AdminStatsOutput, error) {
		return &schema.AdminStatsOutput{}, nil
	})

	topPostsViewsOp := huma.Operation{
		OperationID: "admin-list-stats-top-posts-views",
		Method:      http.MethodGet,
		Path:        "/stats/top-posts-views",
		Summary:     "Get top post view stats",
		Description: "Get the top performing posts ranked by page views.",
		Tags:        []string{"Stats"},
	}
	huma.Register(api, topPostsViewsOp, func(_ context.Context, _ *schema.StatsTopPostsViewsInput) (*schema.AdminStatsOutput, error) {
		return &schema.AdminStatsOutput{}, nil
	})

	topContentOp := huma.Operation{
		OperationID: "admin-list-stats-top-content",
		Method:      http.MethodGet,
		Path:        "/stats/top-content",
		Summary:     "Get top content stats",
		Description: "Get top content statistics ranked by engagement metrics like views and conversions.",
		Tags:        []string{"Stats"},
	}
	huma.Register(api, topContentOp, func(_ context.Context, _ *schema.StatsTopContentInput) (*schema.AdminStatsOutput, error) {
		return &schema.AdminStatsOutput{}, nil
	})

	newsletterStatsOp := huma.Operation{
		OperationID: "admin-list-stats-newsletter-stats",
		Method:      http.MethodGet,
		Path:        "/stats/newsletter-stats",
		Summary:     "Get newsletter stats",
		Description: "Get newsletter-level statistics including open rates, click rates, and subscriber engagement.",
		Tags:        []string{"Stats"},
	}
	huma.Register(api, newsletterStatsOp, func(_ context.Context, _ *schema.StatsNewsletterStatsInput) (*schema.AdminStatsOutput, error) {
		return &schema.AdminStatsOutput{}, nil
	})

	newsletterBasicStatsOp := huma.Operation{
		OperationID: "admin-list-stats-newsletter-basic-stats",
		Method:      http.MethodGet,
		Path:        "/stats/newsletter-basic-stats",
		Summary:     "Get newsletter basic stats",
		Description: "Get basic newsletter statistics including total sent, opened, and clicked counts.",
		Tags:        []string{"Stats"},
	}
	huma.Register(api, newsletterBasicStatsOp, func(_ context.Context, _ *schema.StatsNewsletterStatsInput) (*schema.AdminStatsOutput, error) {
		return &schema.AdminStatsOutput{}, nil
	})

	newsletterClickStatsOp := huma.Operation{
		OperationID: "admin-list-stats-newsletter-click-stats",
		Method:      http.MethodGet,
		Path:        "/stats/newsletter-click-stats",
		Summary:     "Get newsletter click stats",
		Description: "Get newsletter click statistics showing link click counts and rates per email.",
		Tags:        []string{"Stats"},
	}
	huma.Register(api, newsletterClickStatsOp, func(_ context.Context, _ *schema.StatsNewsletterClickInput) (*schema.AdminStatsOutput, error) {
		return &schema.AdminStatsOutput{}, nil
	})

	subscriberCountOp := huma.Operation{
		OperationID: "admin-list-stats-subscriber-count",
		Method:      http.MethodGet,
		Path:        "/stats/subscriber-count",
		Summary:     "Get subscriber count stats",
		Description: "Get newsletter subscriber count statistics over time, including subscribe and unsubscribe events.",
		Tags:        []string{"Stats"},
	}
	huma.Register(api, subscriberCountOp, func(_ context.Context, _ *schema.StatsSubscriberCountInput) (*schema.AdminStatsOutput, error) {
		return &schema.AdminStatsOutput{}, nil
	})

	postsVisitorCountsOp := huma.Operation{
		OperationID: "admin-create-stats-posts-visitor-counts",
		Method:      http.MethodPost,
		Path:        "/stats/posts-visitor-counts",
		Summary:     "Get posts visitor counts",
		Description: "Get visitor counts for a batch of posts. Accepts a list of post IDs in the request body.",
		Tags:        []string{"Stats"},
	}
	huma.Register(api, postsVisitorCountsOp, func(_ context.Context, _ *schema.StatsPostsVisitorCountsInput) (*schema.AdminStatsOutput, error) {
		return &schema.AdminStatsOutput{}, nil
	})

	postsMemberCountsOp := huma.Operation{
		OperationID: "admin-create-stats-posts-member-counts",
		Method:      http.MethodPost,
		Path:        "/stats/posts-member-counts",
		Summary:     "Get posts member counts",
		Description: "Get member attribution counts for a batch of posts. Accepts a list of post IDs in the request body.",
		Tags:        []string{"Stats"},
	}
	huma.Register(api, postsMemberCountsOp, func(_ context.Context, _ *schema.StatsPostsMemberCountsInput) (*schema.AdminStatsOutput, error) {
		return &schema.AdminStatsOutput{}, nil
	})

	postTopReferrersOp := huma.Operation{
		OperationID: "admin-post-top-referrers",
		Method:      http.MethodGet,
		Path:        "/stats/posts/{id}/top-referrers",
		Summary:     "Get post top referrers",
		Description: "Get the top referral sources driving traffic to a specific post.",
		Tags:        []string{"Stats"},
	}
	huma.Register(api, postTopReferrersOp, func(_ context.Context, _ *schema.StatsPostReferrersInput) (*schema.AdminStatsOutput, error) {
		return &schema.AdminStatsOutput{}, nil
	})

	postGrowthOp := huma.Operation{
		OperationID: "admin-post-growth-stats",
		Method:      http.MethodGet,
		Path:        "/stats/posts/{id}/growth",
		Summary:     "Get post growth stats",
		Description: "Get member growth statistics attributed to a specific post, including signups and conversions.",
		Tags:        []string{"Stats"},
	}
	huma.Register(api, postGrowthOp, func(_ context.Context, _ *schema.StatsPostGrowthInput) (*schema.AdminStatsOutput, error) {
		return &schema.AdminStatsOutput{}, nil
	})

	postStatsOp := huma.Operation{
		OperationID: "admin-post-stats",
		Method:      http.MethodGet,
		Path:        "/stats/posts/{id}/stats",
		Summary:     "Get post stats",
		Description: "Get comprehensive statistics for a specific post including views, email delivery, and engagement metrics.",
		Tags:        []string{"Stats"},
	}
	huma.Register(api, postStatsOp, func(_ context.Context, _ *schema.StatsPostStatsInput) (*schema.AdminStatsOutput, error) {
		return &schema.AdminStatsOutput{}, nil
	})

	topSourcesGrowthOp := huma.Operation{
		OperationID: "admin-top-sources-growth",
		Method:      http.MethodGet,
		Path:        "/stats/top-sources-growth",
		Summary:     "Get top source growth stats",
		Description: "Get the top referral sources driving member growth, including free signups and paid conversions.",
		Tags:        []string{"Stats"},
	}
	huma.Register(api, topSourcesGrowthOp, func(_ context.Context, _ *schema.StatsTopSourcesGrowthInput) (*schema.AdminStatsOutput, error) {
		return &schema.AdminStatsOutput{}, nil
	})

	feedbackOp := huma.Operation{
		OperationID: "admin-list-feedback",
		Method:      http.MethodGet,
		Path:        "/feedback/{id}",
		Summary:     "List feedback for member",
		Description: "Browse post feedback (positive/negative sentiment) submitted by members for a specific post.",
		Tags:        []string{"Feedback"},
	}
	huma.Register(api, feedbackOp, func(_ context.Context, _ *schema.FeedbackBrowseInput) (*schema.AdminFeedbackOutput, error) {
		return &schema.AdminFeedbackOutput{}, nil
	})
}
