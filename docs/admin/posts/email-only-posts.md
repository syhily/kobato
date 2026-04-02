---
title: Email only posts
---

To send a post as an email without publishing it on the site, the `email_only` property must be set to `true` when publishing or scheduling the post in combination with the `newsletter` parameter:

```json
// PUT /api/admin/posts/5b7ada404f87d200b5b1f9c8/?newsletter=weekly-newsletter
{
    "posts": [
        {
            "updated_at": "2022-06-05T20:52:37.000Z",
            "status": "published",
            "email_only": true
        }
    ]
}
```

When an email-only post has been sent, the post will have a `status` of `sent`.
