---
title: Posts
description: Posts are the primary resource in a Kobato site. Using the posts endpoint it is possible to get lists of posts filtered by various criteria.
---

```js
GET /content/posts/
GET /content/posts/{id}/
GET /content/posts/slug/{slug}/
```

By default, posts are returned in reverse chronological order by published date when fetching more than one.

The most common gotcha when fetching posts from the Content API is not using the [include](./parameters.md#include) parameter to request related data such as tags and authors. By default, the response for a post will not include these:

```json
{
    "posts": [
        {
            "slug": "welcome-short",
            "id": "5ddc9141c35e7700383b2937",
            "uuid": "a5aa9bd8-ea31-415c-b452-3040dae1e730",
            "title": "Welcome",
            "html": "<p>👋 Welcome, it's great to have you here.</p>",
            "comment_id": "5ddc9141c35e7700383b2937",
            "feature_image": "https://static.kobato.org/v3.0.0/images/welcome-to-kobato.png",
            "feature_image_alt": null,
            "feature_image_caption": null,
            "featured": false,
            "visibility": "public",
            "created_at": "2019-11-26T02:43:13.000+00:00",
            "updated_at": "2019-11-26T02:44:17.000+00:00",
            "published_at": "2019-11-26T02:44:17.000+00:00",
            "custom_excerpt": null,
            "codeinjection_head": null,
            "codeinjection_foot": null,
            "custom_template": null,
            "canonical_url": null,
            "url": "https://docs.kobato.io/welcome-short/",
            "excerpt": "👋 Welcome, it's great to have you here.",
            "reading_time": 0,
            "access": true,
            "og_image": null,
            "og_title": null,
            "og_description": null,
            "twitter_image": null,
            "twitter_title": null,
            "twitter_description": null,
            "meta_title": null,
            "meta_description": null,
            "email_subject": null
        }
    ]
}
```

Posts allow you to include `authors` and `tags` using `&include=authors,tags`, which will add an `authors` and `tags` array to the response, as well as both a `primary_author` and `primary_tag` object.

```bash Request
# cURL
curl "https://demo.kobato.io/api/content/posts/?key=22444f78447824223cefc48062&include=tags,authors"
```

```json Response
{
    "posts": [
        {
            "slug": "welcome-short",
            "id": "5c7ece47da174000c0c5c6d7",
            "uuid": "3a033ce7-9e2d-4b3b-a9ef-76887efacc7f",
            "title": "Welcome",
            "html": "<p>👋 Welcome, it's great to have you here.</p>",
            "comment_id": "5c7ece47da174000c0c5c6d7",
            "feature_image": "https://casper.kobato.org/v2.0.0/images/welcome-to-kobato.jpg",
            "feature_image_alt": null,
            "feature_image_caption": null,
            "featured": false,
            "meta_title": null,
            "meta_description": null,
            "created_at": "2019-03-05T19:30:15.000+00:00",
            "updated_at": "2019-03-26T19:45:31.000+00:00",
            "published_at": "2012-11-27T15:30:00.000+00:00",
            "custom_excerpt": "Welcome, it's great to have you here.",
            "codeinjection_head": null,
            "codeinjection_foot": null,
            "og_image": null,
            "og_title": null,
            "og_description": null,
            "twitter_image": null,
            "twitter_title": null,
            "twitter_description": null,
            "custom_template": null,
            "canonical_url": null,
            "authors": [
                {
                    "id": "5951f5fca366002ebd5dbef7",
                    "name": "Kobato",
                    "slug": "kobato",
                    "profile_image": "https://demo.kobato.io/content/images/2017/07/kobato-icon.png",
                    "cover_image": null,
                    "bio": "The professional publishing platform",
                    "website": "https://kobato.org",
                    "location": null,
                    "facebook": "kobato",
                    "twitter": "@trykobato",
                    "meta_title": null,
                    "meta_description": null,
                    "url": "https://demo.kobato.io/author/kobato/"
                }
            ],
            "tags": [
                {
                    "id": "59799bbd6ebb2f00243a33db",
                    "name": "Getting Started",
                    "slug": "getting-started",
                    "description": null,
                    "feature_image": null,
                    "visibility": "public",
                    "meta_title": null,
                    "meta_description": null,
                    "url": "https://demo.kobato.io/tag/getting-started/"
                }
            ],
            "primary_author": {
                "id": "5951f5fca366002ebd5dbef7",
                "name": "Kobato",
                "slug": "kobato",
                "profile_image": "https://demo.kobato.io/content/images/2017/07/kobato-icon.png",
                "cover_image": null,
                "bio": "The professional publishing platform",
                "website": "https://kobato.org",
                "location": null,
                "facebook": "kobato",
                "twitter": "@trykobato",
                "meta_title": null,
                "meta_description": null,
                "url": "https://demo.kobato.io/author/kobato/"
            },
            "primary_tag": {
                "id": "59799bbd6ebb2f00243a33db",
                "name": "Getting Started",
                "slug": "getting-started",
                "description": null,
                "feature_image": null,
                "visibility": "public",
                "meta_title": null,
                "meta_description": null,
                "url": "https://demo.kobato.io/tag/getting-started/"
            },
            "url": "https://demo.kobato.io/welcome-short/",
            "excerpt": "Welcome, it's great to have you here."
        }
    ]
}
```
