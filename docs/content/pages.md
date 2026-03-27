---
title: Pages
description: Pages are static resources that are not included in channels or collections on the Kobato front-end. The API will only return pages that were created as resources.
---

```js
GET /content/pages/
GET /content/pages/{id}/
GET /content/pages/slug/{slug}/
```

Pages are structured identically to posts. The response object will look the same, only the resource key will be `pages`.

By default, pages are ordered by title when fetching more than one.
