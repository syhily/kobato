// .env loading via the Node built-in (dotenv's silent no-op when the file
// is absent is preserved by the guard)
try {
  process.loadEnvFile()
} catch {
  // no .env file
}
import mdx from '@mdx-js/rollup'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { defineConfig, esmExternalRequirePlugin, loadEnv } from 'vite'
import svgr from 'vite-plugin-svgr'

import pkg from './package.json'
import { INKLING_ALIASES, INKLING_BUNDLE_WORKAROUND_ALIASES } from './vite-aliases'

const outputFileName = pkg.name[0] === '@' ? pkg.name.slice(pkg.name.indexOf('/') + 1) : pkg.name

// Dual-entry build (plan C5): INKLING_ENTRY selects the published entry.
// The default `editor` pass emits the full `.` bundle (ES + UMD, style.css);
// the `core` pass emits the card-free `./core` subpath (ES only, core.css).
// Both passes emit the lazy collaboration chunk, so chunk names carry the
// entry prefix to keep the two passes from overwriting each other.
const inklingEntry = process.env.INKLING_ENTRY === 'core' ? 'core' : 'editor'
const isCoreEntry = inklingEntry === 'core'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd())
  process.env = { ...process.env, ...env }

  const plugins = [
    svgr(),
    react(),
    tailwindcss(),
    mdx(),
    // Convert CJS require("react")/require("react-dom") calls inside
    // bundled dependencies to ESM imports so the ESM build has no
    // runtime require() shims that break in browsers
    esmExternalRequirePlugin({
      external: [/^react($|\/)/, /^react-dom($|\/)/],
      skipDuplicateCheck: true,
    }),
  ]

  return defineConfig({
    plugins,
    server: {
      // Allow access from the Docker dev environment (host.docker.internal)
      allowedHosts: true,
    },
    preview: {
      // Allow access from the Docker dev environment (host.docker.internal)
      allowedHosts: true,
    },
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV),
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
    resolve: {
      alias: { ...INKLING_ALIASES, ...INKLING_BUNDLE_WORKAROUND_ALIASES },
    },
    build: {
      minify: true,
      sourcemap: true,
      cssCodeSplit: true,
      // the first (editor) pass owns the dist cleanup; the core pass must not
      // wipe the artifacts the editor pass just emitted
      emptyOutDir: !isCoreEntry,
      lib: {
        entry: resolve(import.meta.dirname, isCoreEntry ? 'src/core.ts' : 'src/index.ts'),
        name: pkg.name,
        // the `./core` subpath is ESM-only (plan C5) — CJS consumers keep the
        // root UMD
        ...(isCoreEntry ? { formats: ['es' as const] } : {}),
        fileName(format: string) {
          if (isCoreEntry) {
            return 'core.js'
          }
          if (format === 'umd') {
            return `${outputFileName}.umd.cjs`
          }

          return `${outputFileName}.js`
        },
      },
      rolldownOptions: {
        // Suppress upstream Lexical/Rolldown INVALID_ANNOTATION warnings that
        // originate from @lexical/react's pre-minified prod.mjs files. The
        // annotation position is controlled by Meta's build tooling, not us.
        checks: {
          invalidAnnotation: false,
        },
        // Dependency policy (plan 027): feature runtimes (markdown-it and
        // plugins, CodeMirror, emoji-mart, fast-average-color, yjs,
        // y-websocket) are BUNDLED into the dist artifacts so the packed ESM
        // and CJS entries load with only React installed — see
        // scripts/verify-packed-package.ts, the packed-consumer gate.
        // react/react-dom are the only true runtime peers and stay external
        // (including their jsx-runtime/client entry points). Do NOT add
        // feature packages back to this list without a packed-consumer test.
        // jsdom is the one optional peer externalized with them (plan C1):
        // headless HTML conversion lazy-loads it through the DOM port
        // (src/html/headless-dom.ts), and the with-jsdom packed-consumer
        // phases in scripts/verify-packed-package.ts gate the pairing.
        external: [/^react($|\/)/, /^react-dom($|\/)/, /^jsdom($|\/)/],
        output: {
          // both passes emit the lazy collaboration chunk; prefix chunk names
          // with the entry so the two passes don't overwrite each other
          chunkFileNames: `chunks/${inklingEntry}-[name].js`,
          globals: function (id: string) {
            // Global names for the externalized React peer dependencies in
            // the UMD build.
            const globals: Record<string, string> = {
              react: 'React',
              'react/jsx-runtime': 'React',
              'react-dom': 'ReactDOM',
              'react-dom/client': 'ReactDOM',
            }
            if (id in globals) {
              return globals[id]
            }
            // Fallback to a best-effort global name; this keeps the build
            // deterministic even if a new external is added.
            return id.replace(/^@/, '').replace(/\//g, '_').replace(/-/g, '_')
          },
          assetFileNames: (assetInfo: { names?: string[] }) => {
            // Vite 6 changed CSS output naming in lib mode from
            // 'style.css' to deriving from the entry filename.
            // Preserve 'style.css' for backwards compatibility ('core.css'
            // for the core pass — same source sheet, not yet layered; C6
            // owns CSS layering).
            if (assetInfo.names?.[0]?.endsWith('.css')) {
              return isCoreEntry ? 'core.css' : 'style.css'
            }
            return assetInfo.names?.[0] ?? '[name][extname]'
          },
        },
      },
    },
  })
})
