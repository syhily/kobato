---
title: Settings
description: Settings contain the global settings for a site.
---

```js
GET /content/settings/
```

The settings endpoint is a special case. You will receive a single object, rather than an array. This endpoint doesn’t accept any query parameters.

```json
{
    "settings": {
        "title": "Kobato",
        "description": "The professional publishing platform",
        "logo": "https://docs.kobato.io/content/images/2014/09/Kobato-Transparent-for-DARK-BG.png",
        "icon": "https://docs.kobato.io/content/images/2017/07/favicon.png",
        "accent_color": null,
        "cover_image": "https://docs.kobato.io/content/images/2019/10/publication-cover.png",
        "facebook": "kobato",
        "twitter": "@trykobato",
        "lang": "en",
        "timezone": "Etc/UTC",
        "codeinjection_head": null,
        "codeinjection_foot": "<script src=\"//rum-static.pingdom.net/pa-5d8850cd3a70310008000482.js\" async></script>",
        "navigation": [
            {
                "label": "Home",
                "url": "/"
            },
            {
                "label": "About",
                "url": "/about/"
            },
            {
                "label": "Getting Started",
                "url": "/tag/getting-started/"
            },
            {
                "label": "Try Kobato",
                "url": "https://kobato.org"
            }
        ],
        "secondary_navigation": [],
        "meta_title": null,
        "meta_description": null,
        "og_image": null,
        "og_title": null,
        "og_description": null,
        "twitter_image": null,
        "twitter_title": null,
        "twitter_description": null,
        "members_support_address": "noreply@docs.kobato.io",
        "url": "https://docs.kobato.io/"
    }
}
```
