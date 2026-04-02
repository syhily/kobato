---
title: Copying a Post
---

```js
POST /api/admin/posts/{id}/copy
```

Required fields: `id`

Duplicates an existing post, appending “Copy” to the title and slug. The API returns the duplicated post, which is created as a draft:

```js
{
    "posts": [
        {
            "id": "6464d266ada9197e4d34db76",
            "title": "My test post (Copy)",
            "slug": "my-test-post-copy"
            ...
        }
    ]
}
```
