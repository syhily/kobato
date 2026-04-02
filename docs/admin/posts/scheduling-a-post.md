---
title: Scheduling a Post
---

A post can be scheduled by updating or setting the `status` to `scheduled` and setting `published_at` to a datetime in the future:

```json
// PUT /api/admin/posts/5b7ada404f87d200b5b1f9c8/
{
    "posts": [
        {
            "updated_at": "2022-06-05T20:52:37.000Z",
            "status": "scheduled",
            "published_at": "2023-06-10T11:00:00.000Z"
        }
    ]
}
```

At the time specified in `published_at`, the post will be published, email newsletters will be sent (if applicable), and the status of the post will change to `published`. For email-only posts, the status will change to `sent`.
