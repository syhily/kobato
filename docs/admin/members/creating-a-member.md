---
title: Creating a member
---

At minimum, an email is required to create a new, free member.

```json
// POST /api/admin/members/
{
    "members": [
        {
            "email": "jamie@kobato.org",
        }
    ]
}

// Response
{
    "members": [
        {
            "id": "624d445026833200a5801bce",
            "uuid": "83525d87-ac70-40f5-b13c-f9b9753dcbe8",
            "email": "jamie@kobato.org",
            "name": null,
            "note": null,
            "geoLocation": null,
            "created_at": "2022-04-06T07:42:08.000Z",
            "updated_at": "2022-04-06T07:42:08.000Z",
            "labels": [],
            "subscriptions": [],
            "avatar_image": "https://gravatar.com/avatar/7d8efd2c2a781111599a8cae293cf704?s=250&d=blank",
            "email_count": 0,
            "email_opened_count": 0,
            "email_open_rate": null,
            "status": "free",
            "last_seen_at": null,
            "tiers": [],
            "newsletters": []
        }
    ]
}
```

Additional writable member fields include:

| Key             | Description                                      |
| --------------- | ------------------------------------------------ |
| **name**        | member name                                      |
| **note**        | notes on the member                              |
| **labels**      | member labels                                    |
| **newsletters** | List of newsletters subscribed to by this member |

Create a new, free member with name, newsletter, and label:

```json
// POST /api/admin/members/
{
    "members": [
        {
            "email": "jamie@kobato.org",
            "name": "Jamie",
            "labels": [
                {
                    "name": "VIP",
                    "slug": "vip"
                }
            ],
            "newsletters": [
                {
                    "id": "624d445026833200a5801bce"
                }
            ]
        }
    ]
}
```
