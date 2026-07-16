import { defineConfig } from 'taze'

export default defineConfig({
  // Fetch latest package info from registry without cache.
  force: true,
  // Apply updates to package.json automatically (non-interactive).
  write: true,
  // Run package manager install after writing.
  install: true,
  // Update the range prefix (e.g. ^) when the new version justifies it.
  update: true,
  // Include the latest versions.
  mode: 'latest',
  // Only process the workspace root package.json.
  recursive: false,
  // Consider all dependency categories.
  depFields: {
    overrides: true,
    dependencies: true,
    devDependencies: true,
    peerDependencies: true,
    optionalDependencies: true,
  },
  // Keep @types/node within the current major line (24.x).
  packageMode: {
    '@types/node': 'minor',
    'drizzle-kit': 'next',
    'drizzle-orm': 'next',
    // The packageManager field is checked as a dependency; keep pnpm on
    // stable releases only (mode 'latest' above would chase alphas).
    pnpm: 'stable',
  },
})
