import type { Plugin, PluginOption } from 'vite'

import { reactRouter } from '@react-router/dev/vite'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import svgr from 'vite-plugin-svgr'
import { z } from 'zod'

import { inlinePackageDataPlugin } from './scripts/sea/inline-package-data.ts'
import { reactRouterHonoServer } from './src/server/infra/hono/dev.ts'
import { processWorkerEntryPlugin } from './src/server/infra/image/worker-entry-plugin.ts'
import { reactCompilerPlugin } from './src/server/infra/react-compiler-plugin.ts'
import { routeWarmupPlugin } from './src/server/infra/route-warmup.ts'

const pkgSchema = z.object({
  name: z.string(),
  version: z.string(),
  description: z.string(),
  author: z.object({ name: z.string() }),
  homepage: z.string(),
  repository: z.object({ url: z.string() }),
})

const pkg = pkgSchema.parse(JSON.parse(readFileSync('./package.json', 'utf-8')))

const projectRoot = fileURLToPath(new URL('.', import.meta.url))

// The sanitize facade (src/shared/sanitize/sanitize-html.ts) imports the node
// engine (DOMPurify over a process-cached JSDOM). For the browser bundle this
// plugin swaps that specifier to the browser engine, keeping jsdom's
// Node-only dependency chain out of the client — per-environment
// `resolve.alias` is not a thing in vite, so it takes a plugin.
const sanitizeEngineAliasPlugin = (): Plugin => ({
  name: 'sanitize-html-engine-alias',
  enforce: 'pre',
  resolveId: {
    filter: { id: /shared\/sanitize\/engine\.node$/ },
    handler() {
      if (this.environment.name === 'client') {
        return resolve(projectRoot, 'src/shared/sanitize/engine.browser.ts')
      }
      return null
    },
  },
})

export default defineConfig(({ command }) => ({
  ssr:
    command === 'serve'
      ? {
          // emoji-mart's CJS `main` defeats cjs-module-lexer's named-export
          // analysis (parcel $parcel$export helpers) in the dev SSR module
          // runner. Inlining it lets Vite pick the ESM `module` build.
          noExternal: ['emoji-mart'],
        }
      : {
          noExternal: true,
          target: 'node',
          // sharp / @napi-rs/canvas / @duckdb/node-api can never be
          // bundled (their .node loads are unloadable). External here,
          // inlined (and redirected) by vite.sea.config.ts there.
          external: ['sharp', '@napi-rs/canvas', '@duckdb/node-api'],
        },
  environments: {
    client: {
      build: {
        // The inkling editor island (~2.2 MB min / 673 kB gzip) is the one
        // chunk above the 500 kB default. It is only reachable through lazy
        // boundaries — the editor routes (route-level chunks fetched on
        // navigation) and the interaction-gated comment composer
        // (`LazyCommentBodyEditor`) — never through the public pages' static
        // import graph. Keep the limit just above it so genuine regressions
        // elsewhere still warn.
        chunkSizeWarningLimit: 2500,
      },
    },
    ssr: {
      // React Router ≥8.2 strips the `node` resolve condition from the ssr
      // environment unless a Node adapter (@react-router/node etc.) appears
      // in `dependencies` — ours live in devDependencies by convention (see
      // AGENTS.md). Without `node`, packages that only expose
      // node-conditional exports (e.g. mailgun.js) fail to resolve. Restore
      // the condition explicitly — dev SSR needs it just as much as build.
      resolve: {
        conditions: ['node'],
      },
      ...(command === 'build'
        ? {
            build: {
              // Emit assets referenced by the server graph (the cnfs.wasm
              // `?init` import) into build/server/assets — Vite 8 defaults
              // this off for non-client consumers, and React Router's
              // `build.ssrEmitAssets` is no longer honored per-environment.
              emitAssets: true,
              rolldownOptions: {
                input: 'src/server.ts',
              },
            },
          }
        : {}),
    },
  },
  plugins: [
    sanitizeEngineAliasPlugin(),
    inlinePackageDataPlugin(),
    reactCompilerPlugin(),
    reactRouterHonoServer(),
    ...(reactRouter() as Plugin[]),
    tailwindcss(),
    svgr(),
    processWorkerEntryPlugin(),
    routeWarmupPlugin(),
  ] as PluginOption[],
  resolve: {
    tsconfigPaths: true,
    alias: {
      '@': resolve(projectRoot, 'src'),
      '#': resolve(projectRoot, 'tests'),
    },
  },
  // build externalizes above so dev dependency optimization skips them.
  optimizeDeps: {
    // Pin every dep reachable from the client route graph so the FIRST
    // optimize pass covers them: the static scanner only finds a subset,
    // and each late-discovered batch forces a re-optimization plus a
    // full-page reload on cold start (observable via DEBUG=vite:deps).
    include: [
      'react/compiler-runtime',
      // Icon/date families ship thousands of small ESM modules — the
      // costliest to serve unbundled.
      'lucide-react',
      'date-fns',
      'date-fns/locale',
      '@date-fns/tz',
      // @base-ui is consumed per-component subpath; pin each used one.
      '@base-ui/react/alert-dialog',
      '@base-ui/react/avatar',
      '@base-ui/react/checkbox',
      '@base-ui/react/combobox',
      '@base-ui/react/dialog',
      '@base-ui/react/menu',
      '@base-ui/react/popover',
      '@base-ui/react/radio',
      '@base-ui/react/radio-group',
      '@base-ui/react/select',
      '@base-ui/react/separator',
      '@base-ui/react/switch',
      '@base-ui/react/tabs',
      '@base-ui/react/tooltip',
      '@base-ui/react/use-render',
      // App-level client deps (verified against src/{client,ui,routes,shared}).
      '@dnd-kit/core',
      '@dnd-kit/modifiers',
      '@dnd-kit/sortable',
      '@dnd-kit/utilities',
      '@number-flow/react',
      '@orpc/client',
      '@orpc/client/fetch',
      '@orpc/react-query',
      '@simplewebauthn/browser',
      '@tanstack/react-query',
      'cn',
      'cn/config',
      'diff-match-patch',
      'dompurify',
      'idb',
      'medium-zoom/dist/pure',
      'motion/react',
      'qrcode.react',
      'react-day-picker',
      'react-hook-form',
      'sonner',
      'ua-parser-js',
      'zod',
      // The inkling editor (src/inkling) joined the client graph as SOURCE
      // (previously a pre-bundled workspace dist): pin its heavy runtime
      // families so the first optimize pass covers them.
      'lexical',
      '@lexical/clipboard',
      '@lexical/headless',
      '@lexical/html',
      '@lexical/link',
      '@lexical/list',
      '@lexical/markdown',
      // @lexical/react exposes NO root "." export — only subpaths.
      '@lexical/react/LexicalCollaborationContext',
      '@lexical/react/LexicalCollaborationPlugin',
      '@lexical/react/LexicalComposer',
      '@lexical/react/LexicalComposerContext',
      '@lexical/react/LexicalContentEditable',
      '@lexical/react/LexicalHistoryPlugin',
      '@lexical/react/LexicalLinkPlugin',
      '@lexical/react/LexicalListPlugin',
      '@lexical/react/LexicalMarkdownShortcutPlugin',
      '@lexical/react/LexicalNestedComposer',
      '@lexical/react/LexicalOnChangePlugin',
      '@lexical/react/LexicalRichTextPlugin',
      '@lexical/react/LexicalTypeaheadMenuPlugin',
      '@lexical/rich-text',
      '@lexical/selection',
      '@lexical/table',
      '@lexical/text',
      '@lexical/utils',
      '@uiw/react-codemirror',
      '@uiw/codemirror-extensions-basic-setup',
      '@codemirror/autocomplete',
      '@codemirror/commands',
      '@codemirror/lang-css',
      '@codemirror/lang-html',
      '@codemirror/lang-javascript',
      '@codemirror/language',
      '@codemirror/view',
      '@lezer/highlight',
      'emoji-mart',
      '@emoji-mart/data',
      'react-colorful',
      'fast-average-color',
      'markdown-it',
      'markdown-it-footnote',
      'markdown-it-lazy-headers',
      'markdown-it-mark',
      'markdown-it-sub',
      'markdown-it-sup',
      'yjs',
      'y-websocket',
      // Route modules import server orchestrators directly; React Router
      // strips loaders/actions from client chunks only AFTER dep discovery,
      // so these leak into the client optimizer's crawl. Pinning them keeps
      // cold starts single-pass instead of triggering re-optimization
      // reloads. The browser never fetches them at runtime.
      'pino',
      'jsdom',
      '@hono/node-server',
      '@maxmind/geoip2-node',
      '@orpc/server',
      '@simplewebauthn/server',
      '@shikijs/transformers',
      'bcryptjs',
      'drizzle-orm',
      'drizzle-orm/node-sqlite',
      'drizzle-orm/sqlite-core',
      'katex',
      'katex/contrib/mhchem',
      'nodemailer',
      'pinyin-pro',
      'react-dom/server',
      'shiki/core',
      'shiki/engine/oniguruma',
      'shiki/themes/solarized-dark.mjs',
      'shiki/themes/solarized-light.mjs',
      ...[
        'bash',
        'c',
        'cpp',
        'csharp',
        'css',
        'dart',
        'diff',
        'go',
        'html',
        'http',
        'java',
        'javascript',
        'json',
        'jsx',
        'kotlin',
        'lua',
        'markdown',
        'objective-c',
        'php',
        'powershell',
        'python',
        'ruby',
        'rust',
        'scala',
        'scss',
        'shell',
        'sql',
        'svelte',
        'swift',
        'tex',
        'toml',
        'tsx',
        'typescript',
        'vue',
        'xml',
        'yaml',
      ].map((lang) => `shiki/langs/${lang}.mjs`),
    ],
    exclude: ['@duckdb/node-api', 'sharp', '@napi-rs/canvas'],
  },
  build: {
    emptyOutDir: true,
    chunkSizeWarningLimit: 500,
  },
  define: {
    __APP_NAME__: JSON.stringify(pkg.name),
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_DESCRIPTION__: JSON.stringify(pkg.description),
    __APP_AUTHOR_NAME__: JSON.stringify(pkg.author.name),
    __APP_HOMEPAGE__: JSON.stringify(pkg.homepage),
    __APP_REPOSITORY__: JSON.stringify(pkg.repository.url),
  },
  server: {
    port: 4321,
    warmup: {
      clientFiles: ['./src/root.tsx', './src/routes.ts', './src/routes/**/*.{ts,tsx}'],
    },
  },
}))
