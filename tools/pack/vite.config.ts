import { inlinePackageDataPlugin } from '@kobato/pack/sea/inline-package-data'
import { repoRoot, seaIntermediatesDir, type SeaApp } from '@kobato/pack/sea/paths'
import { redirectNativeRequiresPlugin } from '@kobato/pack/sea/redirect-native-requires'
import { readAppPackage, seaAppDefines } from '@kobato/pack/vite/app-metadata'
import { relative } from 'node:path'
import { defineConfig } from 'vite'

interface SeaBundle {
  app: SeaApp
  entry: string
  format: 'cjs' | 'es'
  fileName: string
}

const BUNDLES: Record<string, SeaBundle> = {
  server: { app: 'kobato', entry: 'tools/pack/src/sea/server-entry.ts', format: 'es', fileName: 'server.mjs' },
  worker: {
    app: 'kobato',
    entry: 'packages/server/src/infra/image/process-worker.ts',
    format: 'es',
    fileName: 'process-worker.mjs',
  },
  smoke: { app: 'kobato', entry: 'tools/pack/src/sea/smoke-worker.ts', format: 'es', fileName: 'smoke-worker.mjs' },
  sayaka: { app: 'sayaka', entry: 'tools/pack/src/sea/sayaka-entry.ts', format: 'es', fileName: 'sayaka-server.mjs' },
}

function selectBundle(): SeaBundle {
  const name = process.env.SEA_BUNDLE
  if (name !== undefined && name in BUNDLES) {
    return BUNDLES[name]!
  }
  throw new Error(`SEA_BUNDLE must be one of ${Object.keys(BUNDLES).join('|')} (got "${name ?? ''}")`)
}

const bundle = selectBundle()
const appPackageDir = bundle.app === 'sayaka' ? 'apps/sayaka' : 'apps/kobato'

export default defineConfig({
  root: repoRoot,
  logLevel: 'info',
  define: seaAppDefines(readAppPackage(appPackageDir)),
  plugins: [...(bundle.app === 'kobato' ? [redirectNativeRequiresPlugin()] : []), inlinePackageDataPlugin()],
  build: {
    outDir: relative(repoRoot, seaIntermediatesDir(bundle.app)),
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
