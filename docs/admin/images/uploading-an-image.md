---
title: Uploading an Image
---

To upload an image, send a multipart form data request by providing the `'Content-Type': 'multipart/form-data;'` header, along with the following fields encoded as [FormData](https://developer.mozilla.org/en-US/Web/API/FormData/FormData):

`file`: *[Blob](https://developer.mozilla.org/en-US/Web/API/Blob) or [File](https://developer.mozilla.org/en-US/Web/API/File)* The image data that you want to upload.

`purpose`: *String (default: `image`)* Intended use for the image, changes the validations performed. Can be one of `image` , `profile_image` or `icon`. The supported formats for `image`, `icon`, and `profile_image` are WEBP, JPEG, GIF, PNG and SVG. `profile_image` must be square. `icon` must also be square, and additionally supports the ICO format.

`ref`: *String (optional)* A reference or identifier for the image, e.g. the original filename and path. Will be returned as-is in the API response, making it useful for finding & replacing local image paths after uploads.

```bash
curl -X POST -F 'file=@/path/to/images/my-image.jpg' -F 'ref=path/to/images/my-image.jpg' -H "Authorization: 'Kobato $token'" -H "Accept-Version: $version" https://{admin_domain}/api/admin/images/upload/
```
