import { inlinePackageDataPlugin } from '@kobato/pack/sea/inline-package-data'
import { repoRoot } from '@kobato/pack/sea/paths'
import { redirectNativeRequiresPlugin } from '@kobato/pack/sea/redirect-native-requires'
import { readAppPackage, seaAppDefines } from '@kobato/pack/vite/app-metadata'
import { defineConfig } from 'vite'

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
  root: repoRoot,
  logLevel: 'info',
  define: seaAppDefines(readAppPackage()),
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
