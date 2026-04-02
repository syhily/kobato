---
title: Updating a Webhook
---

```js
PUT /api/admin/webhooks/{id}/
```

All writable fields of a webhook can be updated via edit endpoint. These are following fields:

* `event` - one of [available events](/webhooks/#available-events)
* `target_url` - the target URL to notify when event happens
* `name` - custom name
* `api_version` - API version used when creating webhook payload for an API resource

```json
// PUT /api/admin/webhooks/5f04028cc9b839282b0eb5e3
{
    "webhooks": [{
            "event": "post.published.edited",
            "name": "webhook example"
    }]
}

// Response
{
    "webhooks": [
        {
            "id": "5f04028cc9b839282b0eb5e3",
            "event": "post.published.edited",
            "target_url": "https://example.com/hook/",
            "name": "webhook example",
            "secret": null,
            "api_version": "v6",
            "integration_id": "5c739b7c8a59a6c8ddc164a1",
            "status": "available",
            "last_triggered_at": null,
            "last_triggered_status": null,
            "last_triggered_error": null,
            "created_at": "2020-07-07T05:05:16.000Z",
            "updated_at": "2020-09-15T04:05:07.643Z"
        }
    ]
}
```
