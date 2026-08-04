import { defineConfig } from 'vite'

// Minimal config for `vite-node scripts/*.ts`: Vite's native tsconfig
// paths resolution maps `@kobato/*` → `packages/*/src/*` (root
// tsconfig.json), so script-only tools can import workspace sources
// directly — the pre-split root vite.config.ts used to provide this.
//
//   pnpm exec vite-node --config scripts/vite.node.config.ts scripts/<tool>.ts
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
})
