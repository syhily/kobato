---
title: Publishing a Post
---

Publish a draft post by updating its status to `published`:

```json
// PUT /api/admin/posts/5b7ada404f87d200b5b1f9c8/
{
    "posts": [
        {
            "updated_at": "2022-06-05T20:52:37.000Z",
            "status": "published"
        }
    ]
}
```
