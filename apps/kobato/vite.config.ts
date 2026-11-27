import { appDefines, readAppPackage } from '@kobato/pack/vite/app-metadata'
import { honoDevHost } from '@kobato/pack/vite/hono-dev-host'
import { defineConfig } from 'vite'

export default defineConfig({
  appType: 'custom',
  environments: {
    ssr: {
      resolve: {
        conditions: ['node'],
      },
    },
  },
  plugins: [honoDevHost({ entry: 'src/server.ts' })],
  resolve: {
    tsconfigPaths: true,
  },
  define: appDefines(readAppPackage()),
  server: {
    host: '127.0.0.1',
    port: 4320,
  },
})
