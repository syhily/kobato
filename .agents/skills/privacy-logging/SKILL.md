---
name: privacy-logging
description: Enforces data-sensitivity tiers (L0–L5) and auto-tagging rules for all log output. Trigger when writing or reviewing logging code, audit events, or error handling that touches user data.
---

# Privacy Logging Standards

Implementation: `src/server/infra/logger.ts` (pino-based, auto-tags L3 keys).

## Quick Decision Rules

| Tier | Action | Examples |
| ---- | ------ | -------- |
| **L5** | **NEVER log** | Passwords, session tokens, CSRF tokens, password-reset tokens, API keys |
| **L4** | **NEVER log** | Comment bodies, post/page draft content, contact form submissions |
| **L3** | **Auto-tagged `{E}...{/E}`** | Email, name, phone, IP, user agent, cookie, device ID |
| **L2** | Allowed | `userId`, `commentId`, `postId`, timestamps, vote counts, role |
| **L1** | Allowed | Settings keys, feature flags, IT operations, metrics |
| **L0** | Allowed | Published post titles, public slugs, site name |

## L3 Auto-Tagging

`src/server/infra/logger.ts` wraps known L3 keys automatically at runtime:

- `email`, `name`, `phone`
- `ip`, `clientAddress`, `remoteAddress`, `userAgent`, `ua`, `cookie`, `deviceId`
- `authorEmail`, `authorIp`

**Do NOT write literal `{E}...{/E}` markers in source code.** Pass values under the standard key names in the log context object; the logger handles tagging.

## Audit Log Convention

Use `getLogger('audit.<domain>')` for security-relevant events:

- `audit.user` — login/logout, role changes, soft delete, restore, invite
- `audit.comment` — delete approved/rejected, collapse/uncollapse
- `audit.cms.posts` / `audit.cms.pages` — publish, unpublish, revisions
- `audit.session` — session revoked

Each entry **MUST** include: timestamp, source scope, actor `userId` (L2), event type, outcome. Never include L4/L5 content.

## Alternative Strategies

Prefer lower-sensitivity substitutes:

- `email` → `userId`
- `ip` / `userAgent` → session tracking ID or boolean flag
- `name` → `userId` or `actor` / `target`
- Comment content → `commentId`
