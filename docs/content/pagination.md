---
title: Pagination
---

All browse endpoints are paginated, returning 15 records by default. You can use the [page](./parameters.md#page) and [limit](./parameters.md#limit) parameters to move through the pages of records. The response object contains a `meta.pagination` key with information on the current location within the records:

```json
"meta":{
    "pagination":{
      "page":1,
      "limit":2,
      "pages":1,
      "total":1,
      "next":null,
      "prev":null
    }
  }
```
