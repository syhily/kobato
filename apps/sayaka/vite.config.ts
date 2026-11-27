import { frontEndConfig } from '@kobato/pack/vite/front-end-config'
import { reactRouterHonoServer } from '@kobato/pack/vite/react-router-hono-server'
import { routeWarmupPlugin } from '@kobato/pack/vite/route-warmup'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

export default defineConfig(
  frontEndConfig({
    appDir: 'apps/sayaka',
    port: 4322,
    identityDir: 'apps/sayaka',
    serverEntry: 'src/server.ts',
    ssrExternals: ['@napi-rs/canvas'],
    plugins: {
      leading: [reactRouterHonoServer()],
      trailing: [
        routeWarmupPlugin({
          tier1Routes: ['root', 'routes/layout', 'routes/home'],
          tier2Prefixes: ['routes/'],
          warmupEntry: fileURLToPath(new URL('./src/route-warmup/idle-script.entry.ts', import.meta.url)),
        }),
      ],
    },
  }),
)
