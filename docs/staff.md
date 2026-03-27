---
title: "Staff Users"
description: Staff users within Kobato have access to the admin area with varying levels of permissions for what they can do.
---

***

## Roles & permissions

There are five different staff user roles within Kobato

* **Contributors:** Can log in and write posts, but cannot publish
* **Authors:** Can create and publish new posts and tags
* **Editors:** Can invite, manage and edit authors and contributors
* **Administrators:** Have full permissions to edit all data and settings
* **Owner:** An admin who cannot be deleted

## Author archives

Like [tags](./publishing.md/#tags), staff users are another resource by which content can be organized and sorted. Multiple authors can be assigned to any given post to generate bylines. Equally, author archives can be generated on the front end based on which posts an author is assigned to.

Public author archives are only generated for staff users who are assigned to published posts, any other staff users are not publicly visible.

## Sample API data

Here’s a sample author object from the Kobato [Content API](./content-api.md)

```json
{
  "authors": [
    {
      "slug": "cameron",
      "id": "5ddc9b9510d8970038255d02",
      "name": "Cameron Almeida",
      "profile_image": "https://docs.kobato.io/content/images/2019/03/1c2f492a-a5d0-4d2d-b350-cdcdebc7e413.jpg",
      "cover_image": null,
      "bio": "Editor at large.",
      "website": "https://example.com",
      "location": "Cape Town",
      "facebook": "example",
      "twitter": "@example",
      "meta_title": null,
      "meta_description": null,
      "url": "https://docs.kobato.io/author/cameron/"
    }
  ]
}
```
