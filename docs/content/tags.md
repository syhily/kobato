---
title: Tags
description: Tags are the [primary taxonomy](./publishing.md#tags) within a Kobato site.
---

```js
GET /api/content/tags/
GET /api/content/tags/{id}/
GET /api/content/tags/slug/{slug}/
```

By default, internal tags are always included, use `filter=visibility:public` to limit the response directly to handle filtering and outputting the response.

Tags that are not associated with a post are not returned. You can supply `include=count.posts` to retrieve the number of posts associated with a tag.

```json
{
    "tags": [
        {
            "slug": "getting-started",
            "id": "5ddc9063c35e7700383b27e0",
            "name": "Getting Started",
            "description": null,
            "feature_image": null,
            "visibility": "public",
            "meta_title": null,
            "meta_description": null,
            "og_image": null,
            "og_title": null,
            "og_description": null,
            "twitter_image": null,
            "twitter_title": null,
            "twitter_description": null,
            "codeinjection_head": null,
            "codeinjection_foot": null,
            "canonical_url": null,
            "accent_color": null,
            "url": "https://docs.kobato.io/tag/getting-started/"
        }
    ]
}
```

By default, tags are ordered by name when fetching more than one.
