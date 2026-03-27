---
title: Filtering
---

Kobato uses a query language called NQL to allow filtering API results. You can filter any field or included field using matches, greater/less than or negation, as well as combining with and/or. NQL doesn’t yet support ’like’ or partial matches.

Filter strings must be URL encoded. At it’s most simple, filtering works the same as in GMail, GitHub or Slack - you provide a field and a value, separated by a colon.

## Syntax Reference

### Filter Expressions

A **filter expression** is a string which provides the **property**, **operator** and **value** in the form **property:*operator*value**:

* **property** - a path representing the field to filter on
* **:** - separator between **property** and an **operator**-**value** expression
* **operator** (optional) - how to compare values (`:` on its own is roughly `=`)
* **value** - the value to match against

### Property

Matches: `[a-zA-Z_][a-zA-Z0-9_.]`

* can contain only alpha-numeric characters and `_`
* cannot contain whitespace
* must start with a letter
* supports `.` separated paths, E.g. `authors.slug` or `posts.count`
* is always lowercase, but accepts and converts uppercase

### Value

Can be one of the following

* **null**
* **true**
* **false**
* a ***number*** (integer)
* a **literal**
  * Any character string which follows these rules:
  * Cannot start with `-` but may contain it
  * Cannot contain any of these symbols: `'"+,()><=[]` unless they are escaped
  * Cannot contain whitespace
* a **string**
  * `'` string here `'` Any character except a single or double quote surrounded by single quotes
  * Single or Double quote \_\_MUST \_\_be escaped\*
  * Can contain whitespace
  * A string can contain a date any format that can be understood by `new Date()`
* a **relative date**
  * Uses the pattern now-30d
  * Must start with now
  * Can use - or +
  * Any integer can be used for the size of the interval
  * Supports the following intervals: d, w, M, y, h, m, s

### Operators

* `-` - not
* `>` - greater than
* `>=` - greater than or equals
* `<` - less than
* `<=` - less than or equals
* `~` - contains
* `~^` - starts with
* `~$` - ends with
* `[` value, value, … `]` - “in” group, can be negated with `-`

### Combinations

* `+` - represents and
* `,` - represents or
* `(` filter expression `)` - overrides operator precedence

### Strings vs Literals

Most of the time, there’s no need to put quotes around strings when building filters in Kobato. If you filter based on slugs, slugs are always compatible with literals. However, in some cases you may need to use a string that contains one of the other characters used in the filter syntax, e.g. dates & times contain`:`. Use single-quotes for these.
