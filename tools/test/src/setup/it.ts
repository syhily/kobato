// Run the suite against Zod 4.5's compiled parsers, mirroring production
// (`src/entry.server.tsx`); node tests never set `jitless` (browser-only).
import 'zod/compile'
import '@kobato/test/env.ts'
import { silenceLocalStorageWarning } from '@kobato/test/silence-local-storage-warning.ts'
import { vi } from 'vitest'

silenceLocalStorageWarning()

// `safeFetch` resolves hostnames before dialing; suites stub `fetch`, so DNS
// must not depend on the machine's resolver (VPN/fake-IP setups answer every
// name with 198.18.0.0/15, which the SSRF blocklist correctly rejects).
// Hostnames default to one public address; a file-level mock overrides this.
vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(async () => [{ address: '93.184.216.34', family: 4 }]),
}))
