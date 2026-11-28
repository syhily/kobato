import type { Config } from '@react-router/dev/config'

export default {
  appDirectory: 'src',
  ssr: false,
  routeDiscovery: { mode: 'initial' },
  buildDirectory: 'build/workspace',
} satisfies Config
