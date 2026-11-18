# `@kobato/i18n-tools`

Regional terminology tooling (`i18n:regional-diff`).

- `src/regional-diff.ts` compares the four locale catalogs against the regional glossary and prints the drift report.
- The catalogs are owned by `@kobato/i18n`; this package reads and reports, it never edits messages.
