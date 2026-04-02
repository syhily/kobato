---
title: Overview
---

The members resource provides an endpoint for fetching, creating, and updating member data.

Fetch members (by default, the 15 newest members are returned):

```json
// GET /api/admin/members/?include=newsletters%2Clabels
{
    "members": [
        {
            "id": "623199bfe8bc4d3097caefe0",
            "uuid": "4fa3e4df-85d5-44bd-b0bf-d504bbe22060",
            "email": "jamie@example.com",
            "name": "Jamie",
            "note": null,
            "geoLocation": null,
            "created_at": "2022-03-16T08:03:11.000Z",
            "updated_at": "2022-03-16T08:03:40.000Z",
            "labels": [
                {
                    "id": "623199dce8bc4d3097caefe9",
                    "name": "Label 1",
                    "slug": "label-1",
                    "created_at": "2022-03-16T08:03:40.000Z",
                    "updated_at": "2022-03-16T08:03:40.000Z"
                }
            ],
            "subscriptions": [],
            "avatar_image": "https://gravatar.com/avatar/76a4c5450dbb6fde8a293a811622aa6f?s=250&d=blank",
            "email_count": 0,
            "email_opened_count": 0,
            "email_open_rate": null,
            "status": "free",
            "last_seen_at": "2022-05-20T16:29:29.000Z",
            "newsletters": [
                {
                    "id": "62750bff2b868a34f814af08",
                    "name": "My Kobato Site",
                    "description": null,
                    "status": "active"
                }
            ]
        },
        ...
    ]
}
```

## Subscription object

A paid member includes a subscription object that provides subscription details.

```json
// Subscription object
[
    {
        "id": "sub_1KlTkYSHlkrEJE2dGbzcgc61",
        "customer": {
            "id": "cus_LSOXHFwQB7ql18",
            "name": "Jamie",
            "email": "jamie@kobato.org"
        },
        "status": "active",
        "start_date": "2022-04-06T07:57:58.000Z",
        "default_payment_card_last4": "4242",
        "cancel_at_period_end": false,
        "cancellation_reason": null,
        "current_period_end": "2023-04-06T07:57:58.000Z",
        "price": {
            "id": "price_1Kg0ymSHlkrEJE2dflUN66EW",
            "price_id": "6239692c664a9e6f5e5e840a",
            "nickname": "Yearly",
            "amount": 100000,
            "interval": "year",
            "type": "recurring",
            "currency": "USD"
        },
        "tier": {...},
        "offer": null
    }
]
```

| Key                               | Description                                                     |
| --------------------------------- | --------------------------------------------------------------- |
| **customer**                      | Stripe customer attached to the subscription                    |
| **start\_date**                   | Subscription start date                                         |
| **default\_payment\_card\_last4** | Last 4 digits of the card                                       |
| **cancel\_at\_period\_end**       | If the subscription should be canceled or renewed at period end |
| **cancellation\_reason**          | Reason for subscription cancellation                            |
| **current\_period\_end**          | Subscription end date                                           |
| **price**                         | Price information for subscription including Stripe price ID    |
| **tier**                          | Member subscription tier                                        |
| **offer**                         | Offer details for a subscription                                |
