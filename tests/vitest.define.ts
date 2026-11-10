import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const pkg = require('../package.json')

// Compile-time app globals mirroring the root vite.config.ts define block, shared by the
// unit/it/snaps project configs: route modules that import `@/shared/config/version`
// resolve them under the test bundler instead of throwing ReferenceError. Change the
// shape here, not in three configs.
export const testDefine = {
  __APP_NAME__: JSON.stringify(pkg.name),
  __APP_VERSION__: JSON.stringify(pkg.version),
  __APP_DESCRIPTION__: JSON.stringify(pkg.description),
  __APP_AUTHOR_NAME__: JSON.stringify(pkg.author.name),
  __APP_HOMEPAGE__: JSON.stringify(pkg.homepage),
  __APP_REPOSITORY__: JSON.stringify(pkg.repository.url),
}
