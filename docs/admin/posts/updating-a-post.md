---
title: Updating a Post
---

```js
PUT /api/admin/posts/{id}/
```

Required fields: `updated_at`

All writable fields of a post can be updated via the edit endpoint. The `updated_at` field is required as it is used to handle collision detection and ensure you’re not overwriting more recent updates. It is recommended to perform a GET request to fetch the latest data before updating a post. Below is a minimal example for updating the title of a post:

```json
// PUT /api/admin/posts/5b7ada404f87d200b5b1f9c8/
{
    "posts": [
        {
            "title": "My new title",
            "updated_at": "2022-06-05T20:52:37.000Z"
        }
    ]
}
```

## Saving a new revision

If you'd like a new revision of a post saved as part of the update, pass `save_revision=true` in the query string.

```json
// PUT /api/admin/posts/5b7ada404f87d200b5b1f9c8/?save_revision=true
{
    "posts": [
        {
            "title": "My new title",
            "updated_at": "2022-06-05T20:52:37.000Z"
        }
    ]
}
```

## Tags and Authors

Tag and author relations will be replaced, not merged. Again, the recommendation is to always fetch the latest version of a post, make any amends to this such as adding another tag to the tags array, and then send the amended data via the edit endpoint.
