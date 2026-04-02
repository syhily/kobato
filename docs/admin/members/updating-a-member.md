---
title: Updating a member
---

```js
PUT /api/admin/members/{id}/
```

All writable fields of a member can be updated. It’s recommended to perform a `GET` request to fetch the latest data before updating a member.

A minimal example for updating the name of a member.

```json
// PUT /api/admin/members/{id}/
{
    "members": [
        {
            "name": "Jamie II"
        }
    ]
}
```
