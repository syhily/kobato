import { inlinePackageDataPlugin } from '@kobato/pack/sea/inline-package-data'
import { redirectNativeRequiresPlugin } from '@kobato/pack/sea/redirect-native-requires'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { z } from 'zod'

const pkgSchema = z.object({
  name: z.string(),
  version: z.string(),
  description: z.string(),
  author: z.object({ name: z.string() }),
  homepage: z.string(),
  repository: z.object({ url: z.string() }),
})

const pkg = pkgSchema.parse(JSON.parse(readFileSync('./apps/kobato/package.json', 'utf-8')))

const projectRoot = fileURLToPath(new URL('.', import.meta.url))

const BUNDLES = {
  server: { entry: 'tools/pack/src/sea/server-entry.ts', format: 'es', fileName: 'server.mjs' },
  worker: { entry: 'packages/server/src/infra/image/process-worker.ts', format: 'es', fileName: 'process-worker.mjs' },
  smoke: { entry: 'tools/pack/src/sea/smoke-worker.ts', format: 'es', fileName: 'smoke-worker.mjs' },
} as const

function selectBundle(): { entry: string; format: 'cjs' | 'es'; fileName: string } {
  const name = process.env.SEA_BUNDLE
  if (name === 'server' || name === 'worker' || name === 'smoke') {
    return BUNDLES[name]
  }
  throw new Error(`SEA_BUNDLE must be one of ${Object.keys(BUNDLES).join('|')} (got "${name ?? ''}")`)
}

const bundle = selectBundle()

export default defineConfig({
  root: projectRoot,
  logLevel: 'info',
  define: {
    __SEA_APP_VERSION__: JSON.stringify(pkg.version),
    __APP_NAME__: JSON.stringify(pkg.name),
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_DESCRIPTION__: JSON.stringify(pkg.description),
    __APP_AUTHOR_NAME__: JSON.stringify(pkg.author.name),
    __APP_HOMEPAGE__: JSON.stringify(pkg.homepage),
    __APP_REPOSITORY__: JSON.stringify(pkg.repository.url),
  },
  plugins: [redirectNativeRequiresPlugin(), inlinePackageDataPlugin()],
  build: {
    outDir: 'dist-sea/intermediates',
    emptyOutDir: false,
    target: 'node26',
    minify: true,
    sourcemap: false,
    ssr: bundle.entry,
    rolldownOptions: {
      checks: {
        invalidAnnotation: false,
      },
      output: {
        format: bundle.format,
        codeSplitting: false,
        entryFileNames: bundle.fileName,
      },
    },
  },
  ssr: {
    noExternal: true,
  },
})
