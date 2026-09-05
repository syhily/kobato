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
  // Consider all dependency categories — except peerDependencies: this is a
  // published library, and the react/react-dom peer range is a consumer-facing
  // contract whose floor must not be raised by tooling.
  depFields: {
    overrides: true,
    dependencies: true,
    devDependencies: true,
    peerDependencies: false,
    optionalDependencies: true,
  },
  packageMode: {
    '@types/node': 'minor',
    // The packageManager field is checked as a dependency; keep pnpm on
    // stable releases only (mode 'latest' above would chase alphas).
    pnpm: 'stable',
  },
})
