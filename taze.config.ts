import { defineConfig } from 'taze'

export default defineConfig({
  force: true,
  write: true,
  install: true,
  update: true,
  mode: 'latest',
  recursive: true,
  depFields: {
    overrides: true,
    dependencies: true,
    devDependencies: true,
    peerDependencies: true,
    optionalDependencies: true,
  },
  packageMode: {
    '@types/node': 'minor',
    'drizzle-kit': 'next',
    'drizzle-orm': 'next',
    pnpm: 'stable',
  },
})
