import { createRequire } from 'node:module'
import { resolve, sep } from 'node:path'

const require = createRequire(import.meta.url)

// The one home of the path aliases every vite-flavored config shares
// (vite.config.ts, vite.config.demo.ts, vitest.config.ts, .storybook/main.ts):
// '@/' → src, '#/' → test.
export const INKLING_ALIASES = {
  '@/': resolve(import.meta.dirname, 'src') + sep,
  '#/': resolve(import.meta.dirname, 'test') + sep,
}

// The one remaining bundling workaround (app/demo builds only): prevents
// double-bundling of yjs due to cjs/esm mismatch
// (see https://github.com/facebook/lexical/issues/2153). The events alias
// went with markdown-it-image-lazy-loading — no bundled package imports
// Node's events module anymore (verified against the demo bundle).
export const INKLING_BUNDLE_WORKAROUND_ALIASES = {
  yjs: require.resolve('yjs/src/index.js'),
}
