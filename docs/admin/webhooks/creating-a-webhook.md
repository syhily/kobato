---
title: Creating a Webhook
---

```js
POST /api/admin/webhooks/
```

Required fields: `event`, `target_url` Conditionally required field: `integration_id` - required if request is done using user authentication.
Optional fields: `name`, `secret`, `api_version`

Example to create a webhook using token authenticated request.

```json
// POST /api/admin/webhooks/
{
    "webhooks": [{
            "event": "post.added",
            "target_url": "https://example.com/hook/"
    }]
}
```

When creating a webhook through user authenticated request, minimal payload would look like following:

```json
// POST /api/admin/webhooks/
{
    "webhooks": [{
            "event": "post.added",
            "target_url": "https://example.com/hook/",
            "integration_id": "5c739b7c8a59a6c8ddc164a1"
    }]
}
```

and example response for both requests would be:

```json
{
    "webhooks": [
        {
            "id": "5f04028cc9b839282b0eb5e3",
            "event": "post.added",
            "target_url": "https://example.com/hook/",
            "name": null,
            "secret": null,
            "api_version": "v6",
            "integration_id": "5c739b7c8a59a6c8ddc164a1",
            "status": "available",
            "last_triggered_at": null,
            "last_triggered_status": null,
            "last_triggered_error": null,
            "created_at": "2020-07-07T05:05:16.000Z",
            "updated_at": "2020-09-15T04:01:07.643Z"
        }
    ]
}
```
