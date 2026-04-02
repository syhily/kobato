---
title: Overview
---
The users resource provides an endpoint for fetching and editing staff user data.

Fetch users (by default, the 15 newest staff users are returned):

```json
// GET /api/admin/users/?include=count.posts%2Cpermissions%2Croles%2Croles.permissions
{
    "id": "1",
    "name": "Jamie Larson",
    "slug": "jamie",
    "email": "jamie@example.com",
    "profile_image": "http://localhost:2368/content/images/1970/01/jamie-profile.jpg",
    "cover_image": null,
    "bio": null,
    "website": null,
    "location": null,
    "facebook": null,
    "twitter": null,
    "accessibility": null,
    "status": "active",
    "meta_title": null,
    "meta_description": null,
    "tour": null,
    "last_seen": "1970-01-01T00:00:00.000Z",
    "comment_notifications": true,
    "free_member_signup_notification": true,
    "paid_subscription_started_notification": true,
    "paid_subscription_canceled_notification": false,
    "mention_notifications": true,
    "milestone_notifications": true,
    "created_at": "1970-01-01T00:00:00.000Z",
    "updated_at": "1970-01-01T00:00:00.000Z",
    "permissions": [],
    "roles": [{
        "id": "64498c2a7c11e805e0b4ad4f",
        "name": "Owner",
        "description": "Site Owner",
        "created_at": "1970-01-01T00:00:00.000Z",
        "updated_at": "1970-01-01T00:00:00.000Z",
        "permissions": []
    }],
    "count": {
        "posts": 1
    },
    "url": "http://localhost:2368/author/jamie/"
    },
        ...
    ]
}
```

Note that the Owner user does not have permissions assigned to it, or to the Owner role. This is because the Owner user has *all* permissions implicitly.
