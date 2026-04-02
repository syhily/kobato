---
title: Overview
---

Newsletters allow finer control over distribution of site content via email, allowing members to opt-in or opt-out of different categories of content. By default each site has one newsletter.

## The newsletter object

```json
// GET /api/admin/newsletters/?limit=50
{
    "newsletters": [
        {
            "id": "62750bff2b868a34f814af08",
            "name": "My Kobato site",
            "description": null,
            "slug": "default-newsletter",
            "sender_name": null,
            "sender_email": null,
            "sender_reply_to": "newsletter",
            "status": "active",
            "visibility": "members",
            "subscribe_on_signup": true,
            "sort_order": 0,
            "header_image": null,
            "show_header_icon": true,
            "show_header_title": true,
            "title_font_category": "sans_serif",
            "title_alignment": "center",
            "show_feature_image": true,
            "body_font_category": "sans_serif",
            "footer_content": null,
            "show_badge": true,
            "created_at": "2022-05-06T11:52:31.000Z",
            "updated_at": "2022-05-20T07:43:43.000Z",
            "show_header_name": true,
            "uuid": "59fbce16-c0bf-4583-9bb3-5cd52db43159"
        }
    ],
    "meta": {
        "pagination": {
            "page": 1,
            "limit": 50,
            "pages": 1,
            "total": 1,
            "next": null,
            "prev": null
        }
    }
}
```

| Key                       | Description                                                                                                                                          |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **name**                  | Public name for the newsletter                                                                                                                       |
| **description**           | (nullable) Public description of the newsletter                                                                                                      |
| **status**                | `active` or `archived` - denotes if the newsletter is active or archived                                                                             |
| **slug**                  | The reference to this newsletter that can be used in the `newsletter` option when sending a post via email                                           |
| **sender\_name**          | (nullable) The sender name of the emails                                                                                                             |
| **sender\_email**         | (nullable) The email from which to send emails. Requires validation.                                                                                 |
| **sender\_reply\_to**     | The reply-to email address for sent emails. Can be either `newsletter` (= use `sender_email`) or `support` (use support email from Portal settings). |
| **subscribe\_on\_signup** | `true`/`false`. Whether members should automatically subscribe to this newsletter on signup                                                          |
| **header\_image**         | (nullable) Path to an image to show at the top of emails. Recommended size 1200x600                                                                  |
| **show\_header\_icon**    | `true`/`false`. Show the site icon in emails                                                                                                         |
| **show\_header\_title**   | `true`/`false`. Show the site name in emails                                                                                                         |
| **show\_header\_name**    | `true`/`false`. Show the newsletter name in emails                                                                                                   |
| **title\_font\_category** | Title font style. Either `serif` or `sans_serif`                                                                                                     |
| **show\_feature\_image**  | `true`/`false`. Show the post's feature image in emails                                                                                              |
| **body\_font\_category**  | Body font style. Either `serif` or `sans_serif`                                                                                                      |
| **footer\_content**       | (nullable) Extra information or legal text to show in the footer of emails. Should contain valid HTML.                                               |
| **show\_badge**           | `true`/`false`. Show you’re a part of the indie publishing movement by adding a small Kobato badge in the footer                                     |
