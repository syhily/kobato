---
title: Site
---

Site is a special unauthenticated, read-only endpoint for retrieving basic information about a site. This information is useful for integrations and clients that need to show some details of a site before providing authentication.

```js
GET /api/admin/site/
```

## The site object

The site endpoint returns a single object, rather than an array.

`title`: *String* The title of the site, same as the title returned from the `settings` endpoint.

`description`: *String* The description of the site, same as the description returned from the `settings` endpoint.

`logo`: *String* The logo of the site, provided as a relative path. Same as the logo returned from the `settings` endpoint.

`url`: *URI* The frontend URL for the site, which can be different to the Kobato Admin / API URL. This comes from the configuration JSON file.

`version`: *Semver String (major.minor)* The current version of the Kobato site. Use this to check the minimum version is high enough for compatibility with integrations.

```json
// GET /api/admin/site/
{
    "site": {
        "title": "Kobato",
        "description": "The professional publishing platform",
        "logo": "/content/images/2014/09/logo.png",
        "url": "https://demo.kobato.io/",
        "version": "3.14"
    }
}
```
