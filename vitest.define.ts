import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
// Site metadata is owned by the core app's package.json — the same source
// the two app vite configs' define blocks read (see the monorepo split
// plan, stage 2 §1/§3).
// `require()` of a JSON file is untyped `any`; the double assertion is the
// standard test-config escape (the shape is pinned by the core app's
// package.json).
// oxlint-disable-next-line typescript/no-unsafe-type-assertion
const pkg = require('./apps/core/package.json') as unknown as {
  name: string
  version: string
  description: string
  author: { name: string }
  homepage: string
  repository: { url: string }
}

// The compile-time app globals, mirroring the two app vite configs' define
// blocks (all read apps/core/package.json) — shared by the unit/it/snaps
// project configs so route modules that transitively import
// `@kobato/shared/config/version` (e.g. AdminShell → VersionDialog) resolve
// the globals under the test bundler instead of throwing ReferenceError.
// One owner: change the shape here, not in three configs.
export const testDefine = {
  __APP_NAME__: JSON.stringify(pkg.name),
  __APP_VERSION__: JSON.stringify(pkg.version),
  __APP_DESCRIPTION__: JSON.stringify(pkg.description),
  __APP_AUTHOR_NAME__: JSON.stringify(pkg.author.name),
  __APP_HOMEPAGE__: JSON.stringify(pkg.homepage),
  __APP_REPOSITORY__: JSON.stringify(pkg.repository.url),
}
