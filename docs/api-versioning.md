---
title: "API Versioning"
description: Kobato ships with a mature set of APIs. Each API endpoint has a status, which indicates suitability for production use.
---

***

## Stability Index

* **Stable** - forward compatible changes only
* **Experimental** - being actively worked on, may receive breaking changes
* **Deprecated** - scheduled for removal

## Accept-Version Header

`Accept-Version: v{major}.{minor}`

The ‘Accept-Version’ header allows clients to indicate the minimum version of Kobato they can operate with. It also allows Kobato to determine and communicate if any recent breaking changes are unsuitable for a given client.

When the `Accept-Version` header is received, Kobato will respond with a `Content-Version` header indicating the version of the Kobato install that is responding.

If the `Accept-Version` header is received and the request cannot be processed, Kobato sends an email to the site’s owner and administrators with the details of the problem, to make it easy to find and fix issues with outdated clients.
