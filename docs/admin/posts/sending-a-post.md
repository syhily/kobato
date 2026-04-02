---
title: Sending a Post via email
---

To send a post by email, the `newsletter` query parameter must be passed when publishing or scheduling the post, containing the newsletter’s `slug`.

Optionally, a filter can be provided to send the email to a subset of members subscribed to the newsletter by passing the `email_segment` query parameter containing a valid NQL filter for members. Commonly used values are `status:free` (all free members), `status:-free` (all paid members) and `all`. If `email_segment` is not specified, the default is `all` (no additional filtering applied).

Posts are sent by email if and only if an active newsletter is provided.

```json
// PUT /api/admin/posts/5b7ada404f87d200b5b1f9c8/?newsletter=weekly-newsletter&email_segment=status%3Afree
{
    "posts": [
        {
            "updated_at": "2022-06-05T20:52:37.000Z",
            "status": "published"
        }
    ]
}
```

When a post has been sent by email, the post object will contain the related `newsletter` and `email` objects. If the related email object has a `status` of `failed`, sending can be retried by reverting the post’s status to `draft` and then republishing the post.

```json
{
    "posts": [
        {
            "id": "5ddc9141c35e7700383b2937",
            ...
            "email": {
                "id": "628f3b462de0a130909d4a6a",
                "uuid": "955305de-d89e-4468-927f-2d2b8fec88e5",
                "status": "failed",
                "recipient_filter": "all",
                "error": "Email service is currently unavailable - please try again",
                "error_data": "[{...}]",
                "email_count": 2,
                "delivered_count": 0,
                "opened_count": 0,
                "failed_count": 0,
                "subject": "Welcome",
                "from": "\"Weekly newsletter\"<noreply@example.com>",
                "reply_to": "noreply@example.com",
                "html": "...",
                "plaintext": "...",
                "track_opens": true,
                "submitted_at": "2022-05-26T08:33:10.000Z",
                "created_at": "2022-06-26T08:33:10.000Z",
                "updated_at": "2022-06-26T08:33:16.000Z"
            },
            ...
        }
    ]
}
```
