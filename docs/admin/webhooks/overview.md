---
title: Overview
---

Webhooks allow you to build or set up [custom integrations](https://kobato.org/integrations/custom-integrations/#api-webhook-integrations), which subscribe to certain events in Kobato. When one of such events is triggered, Kobato sends a HTTP POST payload to the webhook’s configured URL. For instance, when a new post is published Kobato can send a notification to configured endpoint to trigger a search index re-build, slack notification, or whole site deploy. For more information about webhooks read [this webhooks reference](/webhooks/).

```js
POST /api/admin/webhooks/
PUT /api/admin/webhooks/{id}/
DELETE /api/admin/webhooks/{id}/
```

## The webhook object

Webhooks can be created, updated, and removed. There is no API to retrieve webhook resources independently.
