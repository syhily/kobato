import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const pkg = require('../../../apps/kobato/package.json')

export const testDefine = {
  __APP_NAME__: JSON.stringify(pkg.name),
  __APP_VERSION__: JSON.stringify(pkg.version),
  __APP_DESCRIPTION__: JSON.stringify(pkg.description),
  __APP_AUTHOR_NAME__: JSON.stringify(pkg.author.name),
  __APP_HOMEPAGE__: JSON.stringify(pkg.homepage),
  __APP_REPOSITORY__: JSON.stringify(pkg.repository.url),
}
