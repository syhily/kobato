---
title: Creating a Post
---

```js
POST /api/admin/posts/
```

Required fields: `title`

Create draft and published posts with the add posts endpoint. All fields except `title` can be empty or have a default that is applied automatically. Below is a minimal example for creating a published post with content:

```json
// POST /api/admin/posts/
{
    "posts": [
        {
            "title": "My test post",
            "lexical": "{\"root\":{\"children\":[{\"children\":[{\"detail\":0,\"format\":0,\"mode\":\"normal\",\"style\":\"\",\"text\":\"Hello, beautiful world! 👋\",\"type\":\"extended-text\",\"version\":1}],\"direction\":\"ltr\",\"format\":\"\",\"indent\":0,\"type\":\"paragraph\",\"version\":1}],\"direction\":\"ltr\",\"format\":\"\",\"indent\":0,\"type\":\"root\",\"version\":1}}",
            "status": "published"
        }
    ]
}
```

A post must always have [at least one author](#tags-and-authors), and this will default to the staff user with the owner role when token authentication is used.

## Source HTML

The post creation endpoint is also able to convert HTML into Lexical. The conversion generates the best available Lexical representation, meaning this operation is lossy and the HTML rendered by Kobato may be different from the source HTML. For the best results ensure your HTML is well-formed, e.g. uses block and inline elements correctly.

To use HTML as the source for your content instead of Lexical, use the `source` parameter:

```json
// POST /api/admin/posts/?source=html
{
    "posts": [
        {
            "title": "My test post",
            "html": "<p>My post content. Work in progress...</p>",
            "status": "published"
        }
    ]
}
```

For lossless HTML conversion, you can wrap your HTML in a single Lexical card:

```html
<!--kg-card-begin: html-->
<p>HTML goes here</p>
<!--kg-card-end: html-->
```

## Tags and Authors

You can link tags and authors to any post you create in the same request body, using either short or long form to identify linked resources.

Short form uses a single string to identify a tag or author resource. Tags are identified by name and authors are identified by email address:

```json
// POST /api/admin/posts/
{
    "posts": [
        {
            "title": "My test post",
            "tags": ["Getting Started", "Tag Example"],
            "authors": ["example@kobato.org", "test@kobato.org"],
            "lexical": "{\"root\":{\"children\":[{\"children\":[{\"detail\":0,\"format\":0,\"mode\":\"normal\",\"style\":\"\",\"text\":\"Hello, beautiful world! 👋\",\"type\":\"extended-text\",\"version\":1}],\"direction\":\"ltr\",\"format\":\"\",\"indent\":0,\"type\":\"paragraph\",\"version\":1}],\"direction\":\"ltr\",\"format\":\"\",\"indent\":0,\"type\":\"root\",\"version\":1}}",
            "status": "published"
        }
    ]
}
```

Long form requires an object with at least one identifying key-value pair:

```json
// POST /api/admin/posts/
{
    "posts": [
        {
            "title": "My test post",
            "tags": [
                { "name": "my tag", "description": "a very useful tag" },
                { "name": "#hidden" }
            ],
            "authors": [
                { "id": "5c739b7c8a59a6c8ddc164a1" },
                { "id": "5c739b7c8a59a6c8ddc162c5" },
                { "id": "5c739b7c8a59a6c8ddc167d9" }
            ]
        }
    ]
}
```

Tags that cannot be matched are automatically created. If no author can be matched, Kobato will fallback to using the staff user with the owner role.
