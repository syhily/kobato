---
title: Creating a Newsletter
---

```js
POST /api/admin/newsletters/
```

Required fields: `name`

Options: `opt_in_existing`

When `opt_in_existing` is set to `true`, existing members with a subscription to one or more active newsletters are also subscribed to this newsletter. The response metadata will include the number of members opted-in.

```json
// POST /api/admin/newsletters/?opt_in_existing=true
{
    "newsletters": [
        {
            "name": "My newly created newsletter",
            "description": "This is a newsletter description",
            "sender_reply_to": "newsletter",
            "status": "active",
            "subscribe_on_signup": true,
            "show_header_icon": true,
            "show_header_title": true,
            "show_header_name": true,
            "title_font_category": "sans_serif",
            "title_alignment": "center",
            "show_feature_image": true,
            "body_font_category": "sans_serif",
            "show_badge": true
        }
    ]
}
```
