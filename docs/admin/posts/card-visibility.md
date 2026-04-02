---
title: Card visibility
---

> If you're manipulating Lexical JSON directly (find-and-replace, content migration, programmatic editing), preserve the `visibility` property on cards. Stripping it resets cards to default visibility, which can unintentionally make members-only content public.

HTML and Call to Action cards support a `visibility` property that controls who sees that specific card. You can mix visibility within a single post, but card-level visibility only affects cards inside a post that the viewer can already access via the post's top-level `visibility`. This allows you to do things like:

- show premium content only to paid members
- display an upgrade prompt only to free members
- hide a sponsored block from paid subscribers

A card with visibility controls looks like this:

```json
{
    "type": "html",
    "html": "<div>Premium analysis...</div>",
    "visibility": {
        "web": {
            "nonMember": false,
            "memberSegment": "status:-free"
        },
        "email": {
            "memberSegment": "status:-free"
        }
    }
}
```

The visibility object has two sub-objects:

**`web`** — controls who sees the card on the website:

- `nonMember` — `true` means visible to everyone including non-members; `false` means members only
- `memberSegment` — NQL filter for which members can see it (e.g., `"status:free,status:-free"` for all members, `"status:-free"` for paid only)

**`email`** — controls who sees the card in email delivery:

- `memberSegment` — NQL filter for which members receive this card in emails

When all visibility toggles are enabled (the default), the card is visible to everyone everywhere. A card with no `visibility` property behaves identically — fully visible.

Here are some common configurations:

```json Visible to all members (free and paid) on web, hidden from non-members
{
    "visibility": {
        "web": { "nonMember": false, "memberSegment": "status:free,status:-free" },
        "email": { "memberSegment": "status:free,status:-free" }
    }
}
```

```json Visible to paid members only
{
    "visibility": {
        "web": { "nonMember": false, "memberSegment": "status:-free" },
        "email": { "memberSegment": "status:-free" }
    }
}
```

Card-level visibility is a Lexical JSON feature. If you're sending content with source=html, Kobato creates cards automatically and visibility settings aren't available — work with Lexical JSON directly if you need them.
