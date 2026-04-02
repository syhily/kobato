---
title: Overview
---

Sending images to Kobato via the API allows you to upload images one at a time, and store them with a [storage adapter](https://kobato.org/integrations/?tag=storage). The default adapter stores files locally in /content/images/ without making any modifications, except for sanitizing the filename.

```js
POST /api/admin/images/upload/
```

## The image object

Images can be uploaded to, and fetched from storage. When an image is uploaded, the response is an image object that contains the new URL for the image - the location from which the image can be fetched.

`url`: *URI* The newly created URL for the image.

`ref`: *String (optional)* The reference for the image, if one was provided with the upload.

```json
// POST /api/admin/images/upload/

{
    "images": [
        {
            "url": "https://demo.kobato.io/content/images/2019/02/kobato-logo.png",
            "ref": "kobato-logo.png"
        }
    ]
}
```
