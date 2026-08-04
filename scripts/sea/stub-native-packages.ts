// Frontend SEA line: stub the native packages out of the bundle.
//
// DEFENSIVE GUARD: the frontend's runtime graph (apps/public/src) does
// NOT import the server package today — its SSR content loads over HTTP
// from core (the `@kobato/server` imports live in tests only, which are
// never bundled). But the server graph contains the native packages
// (sharp, @napi-rs/canvas, @duckdb/node-api), which are core-only
// capabilities: if a future frontend change ever pulls any of them into
// the bundle, the frontend binary would fail at boot (no natives
// embedded, no `KOBATO_NATIVES_DIR`). The stubs keep that failure mode
// impossible by construction.
//
// This plugin virtualizes the three packages with inert stubs. Every
// import site is inside a function body (verified: no module-scope
// `sharp(...)` / `createCanvas(...)` / `DuckDBInstance.create()` calls in
// the server graph), so the stubs' throws are never reached on the
// frontend — they exist only to satisfy the bundler's module graph.
//
// The stubs must export every binding the server graph imports (default
// export for sharp, named exports for canvas/duckdb). Missing exports
// would surface as undefined at runtime only if the code path ran, but
// rolldown can also fail the build on unresolvable named exports — keep
// the export lists complete.

import type { Plugin } from 'vite'

const STUB_PREFIX = '\0kobato-stub-native:'

// Specifier → stub source. A `Record` (rather than a literal key type):
// the plugin resolves arbitrary specifier strings and guards with `in`
// before indexing, so string indexing must be legal.
const STUB_SOURCE: Readonly<Record<string, string>> = {
  sharp: `// sharp stub — the frontend binary has no native libraries.
export default function sharpStub() {
  throw new Error('sharp is not bundled in the frontend SEA binary (image processing is core-only)')
}
`,
  '@napi-rs/canvas': `// @napi-rs/canvas stub — the frontend binary has no native libraries.
export function createCanvas() {
  throw new Error('@napi-rs/canvas is not bundled in the frontend SEA binary (rendering is core-only)')
}
export function loadImage() {
  throw new Error('@napi-rs/canvas is not bundled in the frontend SEA binary (rendering is core-only)')
}
export class Canvas {
  constructor() {
    throw new Error('@napi-rs/canvas is not bundled in the frontend SEA binary (rendering is core-only)')
  }
}
export const GlobalFonts = {
  has: () => false,
  register: () => false,
  registerFromPath: () => false,
}
`,
  '@duckdb/node-api': `// @duckdb/node-api stub — the frontend binary has no native libraries.
//
// This one is FUNCTIONAL (not a thrower): the transitional public SSR
// graph opens the analytics sidecar eagerly at boot (db-lifecycle module
// scope) and the access-log batcher appends page views on requests. The
// frontend never queries analytics, so the stub silently drops every
// write and answers reads with empty results — page views recorded by a
// frontend binary go nowhere, which is correct: analytics is core's job
// in the headless topology.
const noopAppender = {
  appendTimestampMilliseconds() {},
  appendVarchar() {},
  appendNull() {},
  appendBigInt() {},
  appendDouble() {},
  appendBoolean() {},
  endRow() {},
  flushSync() {},
  closeSync() {},
}
const noopConnection = {
  async run() {
    return { getRowObjects: () => [] }
  },
  async runAndReadAll() {
    return { getRowObjects: () => [] }
  },
  async createAppender() {
    return noopAppender
  },
  closeSync() {},
}
export const DuckDBInstance = {
  create: async () => ({
    connect: async () => noopConnection,
    closeSync() {},
  }),
}
export class DuckDBTimestampMillisecondsValue {
  constructor(_value) {}
  static fromDate() {
    return new DuckDBTimestampMillisecondsValue(0n)
  }
}
`,
}

export function stubNativePackagesPlugin(): Plugin {
  return {
    name: 'stub-native-packages',
    enforce: 'pre',
    resolveId(id) {
      if (id in STUB_SOURCE) {
        return `${STUB_PREFIX}${id}`
      }
      return null
    },
    load(id) {
      if (id.startsWith(STUB_PREFIX)) {
        const name = id.slice(STUB_PREFIX.length)
        // Unknown specifiers fall through (null = no transform, like a
        // non-matching resolveId).
        if (name in STUB_SOURCE) {
          return STUB_SOURCE[name]
        }
      }
      return null
    },
  }
}
