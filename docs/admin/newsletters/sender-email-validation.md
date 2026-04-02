---
title: Sender email validation
---

When updating the `sender_email` field, email verification is required before emails are sent from the new address. After updating the property, the `sent_email_verification` metadata property will be set, containing `sender_email`. The `sender_email` property will remain unchanged until the address has been verified by clicking the link that is sent to the address specified in `sender_email`.

```json
PUT /api/admin/newsletters/62750bff2b868a34f814af08/
{
    "newsletters": [
        {
            "sender_email": "daily-newsletter@domain.com"
        }
    ]
}

// Response
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
    ],
    "meta": {
        "sent_email_verification": [
            "sender_email"
        ]
    }
}
```
