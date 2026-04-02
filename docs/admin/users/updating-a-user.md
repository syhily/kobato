---
title: Updating a user
---

```js
PUT /api/admin/users/{id}/
```

All writable fields of a user can be updated. It’s recommended to perform a `GET` request to fetch the latest data before updating a user.

```json
// PUT /api/admin/users/{id}/
{
    "users": [
        {
            "name": "Cameron Larson"
        }
    ]
}
```
