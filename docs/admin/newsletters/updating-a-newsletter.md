---
title: Updating a Newsletter
---

```json
PUT /api/admin/newsletters/629711f95d57e7229f16181c/
{
    "newsletters": [
        {
            "id": "62750bff2b868a34f814af08",
            "name": "My newly created newsletter",
            "description": "This is an edited newsletter description",
            "sender_name": "Daily Newsletter",
            "sender_email": null,
            "sender_reply_to": "newsletter",
            "status": "active",
            "subscribe_on_signup": true,
            "sort_order": 1,
            "header_image": null,
            "show_header_icon": true,
            "show_header_title": true,
            "title_font_category": "sans_serif",
            "title_alignment": "center",
            "show_feature_image": true,
            "body_font_category": "sans_serif",
            "footer_content": null,
            "show_badge": true,
            "show_header_name": true
        }
    ]
}
```
