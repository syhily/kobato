---
title: Errors
---

The Content API will generate errors for the following cases:

* Status 400: Badly formed queries e.g. filter parameters that are not correctly encoded
* Status 401: Authentication failures e.g. unrecognized keys
* Status 403: Permissions errors e.g. under-privileged users
* Status 404: Unknown resources e.g. data which is not public
* Status 500: Server errors e.g. where something has gone

Errors are also formatted in JSON, as an array of error objects. The HTTP status code of the response along with the `errorType` property indicate the type of error.

The `message` field is designed to provide clarity on what exactly has gone wrong.

```json
{
    "errors": [
        {
            "message": "Unknown Content API Key",
            "errorType": "UnauthorizedError"
        }
    ]
}
```
