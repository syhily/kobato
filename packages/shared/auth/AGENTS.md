# `@kobato/auth`

Isomorphic authentication and identity primitives.

- `roles.ts` — role vocabulary, ordering, role label message ids.
- `security.ts` — password policy (length bounds, the bcrypt 72-byte ceiling + `passwordWithinBcryptLimit`, complexity
  regex) and Web Crypto token/email primitives. The Zod factory `newPasswordSchema` lives in
  `@kobato/api/contracts/account/self.ts` so wire inputs single-source it.
- `network.ts` — `isBlockedFetchHost` / `isPrivateIp` (SSRF host and CIDR grammar) and `isValidPasskeyDomain` (HTTPS
  public-RP rule); no dependencies. Generic URL formatting stays in `@kobato/utils/safe-url`.
- `trusted-proxy.ts` — `isValidIp` / `isValidTrustedProxyEntry` / `matchesTrustedProxy` (strict IP grammar and IPv4 CIDR
  trusted-proxy matching); no dependencies. Deliberately separate from `network.ts`'s permissive SSRF parser.
- No session persistence, HTTP guards, React, database, or server-only flows. `escapeHtml` belongs to
  `@kobato/sanitize`.
- Allowed deps: `@kobato/i18n` only. Tests: `tests/unit/` (`shared-unit`).
