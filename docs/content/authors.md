---
title: Authors
description: Authors are a subset of [users](../staff.md) who have published posts associated with them.
---

```js
GET /api/content/authors/
GET /api/content/authors/{id}/
GET /api/content/authors/slug/{slug}/
```

Authors that are not associated with a post are not returned. You can supply `include=count.posts` to retrieve the number of posts associated with an author.

```json
{
    "authors": [
        {
            "slug": "cameron",
            "id": "5ddc9b9510d8970038255d02",
            "name": "Cameron Almeida",
            "profile_image": "https://docs.kobato.io/content/images/2019/03/1c2f492a-a5d0-4d2d-b350-cdcdebc7e413.jpg",
            "cover_image": null,
            "bio": "Editor at large.",
            "website": "https://example.com",
            "location": "Cape Town",
            "facebook": "example",
            "twitter": "@example",
            "meta_title": null,
            "meta_description": null,
            "url": "https://docs.kobato.io/author/cameron/"
        }
    ]
}
```
