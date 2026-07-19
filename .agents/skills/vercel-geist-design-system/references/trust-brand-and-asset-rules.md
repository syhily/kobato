## Trust, Brand, And Asset Rules

Load this before certification/trust credential displays, official marks,
iconography, logos, badges, or brand asset work. Use `component-system.md` only
for the component behavior that contains these assets.

## Certifications And Trust Credentials

Certification, accreditation, compliance, partner, and issuer information is
content, not decoration. Preserve existing credential names, issuers, status,
dates, source links, and same-site destinations unless the user explicitly asks
to remove them or they disclose sensitive/private information.

When asked for certification logos, badges, marks, or credential artwork, use
only certification-specific official logo/badge artwork from the certification
or credential source. Generic certificate images, certificate scans, generic
certificate seals/marks, course-completion certificates/marks, issuer/company
logos, inferred logos, text labels, text monograms, text-only cards, Geist
Badge/Pill UI badges, and invented badge artwork are not substitutes for the
certification badge. Issuer or company logos may supplement a credential only as
secondary context and must never masquerade as certification-specific artwork.
If certification-specific official artwork is missing, show an honest
unavailable state or keep the existing content rather than fabricating or
substituting a badge.

## Iconography

Icon and asset decisions are source-gated: use Geist component pages for
icon-bearing component behavior, Button for icon-only/svg-only button guidance,
Brands for official marks, and Web Interface Guidelines for hit targets and
accessible names. Do not claim official Geist icon compliance from an icon
package name alone.

- For official logos, follow Brand Assets And Trademark Gate below.
- For generic UI symbols, use the project's existing icon library or installed
  assets unless a current non-redirecting official Geist icons source is
  consulted. While Geist resource/icon links redirect to Introduction, they do
  not authorize package-specific icon compliance claims.
- Size and align icons through the consulted Geist component, existing mapped
  primitive, or shared token. Do not introduce exact icon-size mandates unless a
  current official source or existing Geist-mapped primitive supplies them.
- Buttons that perform common tool actions may use familiar icons only when the
  control still has an accessible name and follows the consulted Button/icon-only
  guidance.
- Icon-only buttons and compact controls must satisfy Web Interface Guidelines
  hit-target rules: visual targets below 24px need expanded hit targets, and
  mobile targets are 44px.
- Local heuristic, not `Docs Evidence`: do not use decorative icon clusters to
  fill space.

## Brand Assets And Trademark Gate

Use official Vercel brand assets only for truthful references. Do not modify
marks, make them more prominent than the app's own brand, use them in
product/company names, or imply endorsement. Follow
`https://vercel.com/geist/brands` for Vercel, Next.js, Turbo/Turborepo/Turbopack,
v0, and AI SDK assets, logo imports, spacing, attribution, permitted usage, and
misuse rules.
