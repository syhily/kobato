---
title: "Overview"
description: Kobato’s RESTful Content API delivers published content to the world and can be accessed in a read-only manner by any client to render in a website, app, or other embedded media.
---

***

Access control is managed via an API key, and even the most complex filters are made simple with our SDK. The Content API is designed to be fully cacheable, meaning you can fetch data as often as you like without limitation.

***

## URL

`https://{site_domain}/api/content/`

### Key

`?key={key}`

Content API keys are provided via a query parameter in the URL. These keys are safe for use in browsers and other insecure environments, as they only ever provide access to public data. Sites in private mode should consider where they share any keys they create.

Obtain the Content API URL and key by creating a new `Custom Integration` under the **Integrations** screen in Kobato Admin.

### Accept-Version Header

`Accept-Version: v{major}.{minor}`

Use the `Accept-Version` header to indicate the minimum version of Kobato’s API to operate with. See [API Versioning](./api-versioning.md) for more details.

### Working Example

```bash
# cURL
# Real endpoint - copy and paste to see!
curl -H "Accept-Version: v1.0" "https://demo.Kobato.io/api/content/posts/?key=22444f78447824223cefc48062"
```

***

## Endpoints

The Content API provides access to Posts, Pages, Tags, Authors, Tiers, and Settings. All endpoints return JSON and are considered [stable](/faq/api-versioning/).

### Available Endpoints

| Verb | Path                                           | Method                |
| ---- | ---------------------------------------------- | --------------------- |
| GET  | [/posts/](./content/posts.md)                  | Browse posts          |
| GET  | [/posts/\{id}/](./content/posts.md)            | Read a post by ID     |
| GET  | [/posts/slug/\{slug}/](./content/posts.md)     | Read a post by slug   |
| GET  | [/authors/](./content/authors.md)              | Browse authors        |
| GET  | [/authors/\{id}/](./content/authors.md)        | Read an author by ID  |
| GET  | [/authors/slug/\{slug}/](./content/authors.md) | Read a author by slug |
| GET  | [/tags/](./content/tags.md)                    | Browse tags           |
| GET  | [/tags/\{id}/](./content/tags.md)              | Read a tag by ID      |
| GET  | [/tags/slug/\{slug}/](./content/tags.md)       | Read a tag by slug    |
| GET  | [/pages/](./content/pages.md)                  | Browse pages          |
| GET  | [/pages/\{id}/](./content/pages.md)            | Read a page by ID     |
| GET  | [/pages/slug/\{slug}/](./content/pages.md)     | Read a page by slug   |
| GET  | [/tiers/](./content/tiers.md)                  | Browse tiers          |
| GET  | [/settings/](./content/settings.md)            | Browse settings       |

The Content API supports two types of request: Browse and Read. Browse endpoints allow you to fetch lists of resources, whereas Read endpoints allow you to fetch a single resource.

***

## Resources

The API will always return valid JSON in the same structure:

```json
{
    "resource_type": [{
        ...
    }],
    "meta": {}
}
```

* `resource_type`: will always match the resource name in the URL. All resources are returned wrapped in an array, with the exception of `/site/` and `/settings/`.
* `meta`: contains [pagination](./content/pagination.md) information for browse requests.
