---
title: Parameters
---

Query parameters provide fine-grained control over responses. All endpoints accept `include` and `fields`. Browse endpoints additionally accept `filter`, `limit`, `page` and `order`.

## Include

Tells the API to return additional data related to the resource you have requested. The following includes are available:

* Posts & Pages: `authors`, `tags`
* Authors: `count.posts`
* Tags: `count.posts`
* Tiers: `monthly_price`, `yearly_price`, `benefits`

Includes can be combined with a comma, e.g., `&include=authors,tags`.

For posts and pages:

* `&include=authors` will add `"authors": [{...},]` and `"primary_author": {...}`
* `&include=tags` will add `"tags": [{...},]` and `"primary_tag": {...}`

For authors and tags:

* `&include=count.posts` will add `"count": {"posts": 7}` to the response.

For tiers:

* `&include=monthly_price,yearly_price,benefits` will add monthly price, yearly price, and benefits data.

## Fields

Limit the fields returned in the response object. Useful for optimizing queries, but does not play well with include.

E.g. for posts `&fields=title,url` would return:

```json
{
    "posts": [
        {
            "id": "5b7ada404f87d200b5b1f9c8",
            "title": "Welcome to Kobato",
            "url": "https://demo.kobato.io/welcome/"
        }
    ]
}
```

## Formats

(Posts and Pages only)

By default, only `html` is returned, however each post and page in Kobato has 2 available formats: `html` and `plaintext`.

* `&formats=html,plaintext` will additionally return the plaintext format.

## Filter

(Browse requests only)

Apply fine-grained filters to target specific data.

* `&filter=featured:true` on posts returns only those marked featured.
* `&filter=tag:getting-started` on posts returns those with the tag slug that matches `getting-started`.
* `&filter=visibility:public` on tiers returns only those marked as publicly visible.

The possibilities are extensive! Query strings are explained in detail in the [filtering](/content-api/filtering) section.

## Limit

(Browse requests only)

By default, only 15 records are returned at once.

* `&limit=5` would return only 5 records
* `&limit=100` will return 100 records (max)

## Page

(Browse requests only)

By default, the first 15 records are returned.

* `&page=2` will return the second set of 15 records.

## Order

(Browse requests only)

Different resources have a different default sort order:

* Posts: `published_at DESC` (newest post first)
* Pages: `title ASC` (alphabetically by title)
* Tags: `name ASC` (alphabetically by name)
* Authors: `name ASC` (alphabetically by name)
* Tiers: `monthly_price ASC` (from lowest to highest monthly price)

The syntax for modifying this follows SQL order by syntax:

* `&order=published_at%20asc` would return posts with the newest post last
