---
title: Invites
---

The invites resource provides an endpoint for inviting staff users to the Kobato instance. To invite a user you must specify the ID of the role they should receive (fetch roles, detailed above, to find the role IDs for your site), and the email address that the invite link should be sent to.

```json
// POST /api/admin/invites/
{
    "invites": [
        {
            "role_id": "64498c2a7c11e805e0b4ad4b",
            "email": "person@example.com"
        },
        ...
    ]
}
```
