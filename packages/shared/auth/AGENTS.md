# `@kobato/auth`

Isomorphic authentication and identity primitives shared by server, web, and wire contracts.

- `roles.ts` owns role vocabulary, ordering, and role label message ids.
- `security.ts` owns password policy (minimum length, maximum length, the bcrypt 72-byte ceiling + `passwordWithinBcryptLimit`, the complexity regex) and the Web Crypto token/email primitives. The Zod factory composing the policy (`newPasswordSchema`) lives in `@kobato/contracts/users.ts` so wire inputs single-source it.
- `network.ts` owns network-boundary security primitives: `isBlockedFetchHost` / `isPrivateIp` (the SSRF host and CIDR grammar) and `isValidPasskeyDomain` (HTTPS public-RP rule). Generic URL formatting stays in `@kobato/utils/safe-url`; this module has no dependencies.
- No session persistence, HTTP guards, React, database, or server-only authentication flows. `escapeHtml` belongs to `@kobato/sanitize`.
- Allowed deps: `@kobato/i18n` only. Tests: `tests/unit/` under `shared-unit`.
