import type { Plugin, PluginOption } from 'vite'

import { inlinePackageDataPlugin } from '@kobato/pack/sea/inline-package-data'
import { reactRouterHonoServer } from '@kobato/server/infra/hono/dev'
import { processWorkerEntryPlugin } from '@kobato/server/infra/image/worker-entry-plugin'
import { reactCompilerPlugin } from '@kobato/toolchain/src/vite/react-compiler-plugin'
import { routeWarmupPlugin } from '@kobato/toolchain/src/vite/route-warmup'
import { reactRouter } from '@react-router/dev/vite'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import svgr from 'vite-plugin-svgr'
import { z } from 'zod'

const pkgSchema = z.object({
  name: z.string(),
  version: z.string(),
  description: z.string(),
  author: z.object({ name: z.string() }),
  homepage: z.string(),
  repository: z.object({ url: z.string() }),
  dependencies: z.record(z.string(), z.string()).optional(),
  devDependencies: z.record(z.string(), z.string()).optional(),
})

const workspacePkgSchema = z.object({
  name: z.string(),
  dependencies: z.record(z.string(), z.string()).optional(),
  devDependencies: z.record(z.string(), z.string()).optional(),
})

const projectRoot = fileURLToPath(new URL('.', import.meta.url))
const repoRoot = fileURLToPath(new URL('../..', import.meta.url))

const pkg = pkgSchema.parse(JSON.parse(readFileSync(resolve(projectRoot, 'package.json'), 'utf-8')))

const appDeclared = new Set([...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})])

const manifests = [
  'packages/api',
  'packages/db',
  'packages/web/client',
  'packages/web/public',
  'packages/web/admin',
  'packages/ui',
  'packages/server',
  'packages/shared/utils',
  'packages/shared/auth',
  'packages/shared/catalog',
  'packages/shared/distribution',
  'packages/shared/telemetry',
  'packages/shared/i18n',
  'packages/shared/cache',
  'packages/shared/settings',
  'packages/shared/assets',
  'packages/shared/sanitize',
  'packages/shared/contracts',
  'packages/shared/seo',
  'packages/inkling',
].map((dir) => workspacePkgSchema.parse(JSON.parse(readFileSync(resolve(repoRoot, dir, 'package.json'), 'utf-8'))))

const depOwner = new Map<string, string>()
for (const appDeclaredOnly of [true, false]) {
  for (const manifest of manifests) {
    if (appDeclared.has(manifest.name) !== appDeclaredOnly) {
      continue
    }
    for (const dep of [...Object.keys(manifest.dependencies ?? {}), ...Object.keys(manifest.devDependencies ?? {})]) {
      if (!depOwner.has(dep)) {
        depOwner.set(dep, manifest.name)
      }
    }
  }
}

function packageNameOf(entry: string): string {
  const parts = entry.split('/')
  return entry.startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0]!
}

function optimizeIncludeHints(entries: readonly string[]): string[] {
  return entries.map((entry) => {
    const name = packageNameOf(entry)
    if (appDeclared.has(name)) {
      return entry
    }
    const owner = depOwner.get(name)
    return owner ? `${owner} > ${entry}` : entry
  })
}

const sanitizeEngineAliasPlugin = (): Plugin => ({
  name: 'sanitize-html-engine-alias',
  enforce: 'pre',
  resolveId: {
    filter: { id: /(^|\/)engine\.node(\.ts)?$/ },
    handler() {
      if (this.environment.name === 'client') {
        return resolve(repoRoot, 'packages/shared/sanitize/src/engine.browser.ts')
      }
      return null
    },
  },
})

export default defineConfig(({ command }) => ({
  ssr:
    command === 'serve'
      ? {
          noExternal: ['emoji-mart'],
        }
      : {
          noExternal: true,
          target: 'node',
          external: ['sharp', '@napi-rs/canvas', '@duckdb/node-api'],
        },
  environments: {
    client: {
      build: {
        chunkSizeWarningLimit: 2500,
      },
    },
    ssr: {
      resolve: {
        conditions: ['node'],
      },
      ...(command === 'build'
        ? {
            build: {
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
  },
  optimizeDeps: {
    include: optimizeIncludeHints([
      'react/compiler-runtime',
      'lucide-react',
      'date-fns',
      'date-fns/locale',
      '@date-fns/tz',
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
      'zod',
      'lexical',
      '@lexical/clipboard',
      '@lexical/headless',
      '@lexical/html',
      '@lexical/link',
      '@lexical/list',
      '@lexical/markdown',
      '@lexical/react/LexicalCollaborationContext',
      '@lexical/react/LexicalCollaborationPlugin',
      '@lexical/react/LexicalComposer',
      '@lexical/react/LexicalComposerContext',
      '@lexical/react/LexicalContentEditable',
      '@lexical/react/LexicalExtensionComposer',
      '@lexical/react/LexicalHistoryPlugin',
      '@lexical/react/LexicalLinkPlugin',
      '@lexical/react/LexicalListPlugin',
      '@lexical/react/LexicalMarkdownShortcutPlugin',
      '@lexical/react/LexicalNestedComposer',
      '@lexical/react/LexicalOnChangePlugin',
      '@lexical/react/LexicalRichTextPlugin',
      '@lexical/react/LexicalTypeaheadMenuPlugin',
      '@lexical/react/ReactExtension',
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
    ]),
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
