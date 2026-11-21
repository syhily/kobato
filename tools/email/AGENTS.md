# `@kobato/email`

Localized email-template previews (`emails:generate`).

- `src/generate.ts` renders every server email template in all four locales from a throwaway config.
- Templates themselves live in `packages/server/src/infra/email`; copy comes from the server i18n catalog. This package
  is a renderer, never a template owner.
