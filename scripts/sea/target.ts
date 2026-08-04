// SEA dual build-line target resolution (stage 2, plan item 2).
//
// The pipeline parameterizes over two binaries:
//   core      — the headless core: admin SSR + /rpc + /api + URL endpoints
//               + DB + natives + migrations + wasm + worker (the original
//               single-line pipeline, unchanged behavior)
//   frontend  — the official public SSR service: public routes + client
//               assets only — no natives, no worker, no migrations
//
// Resolution order (first hit wins):
//   1. `--target <core|frontend>` CLI arg (both `--target frontend` and
//      `--target=frontend` spellings)
//   2. `SEA_TARGET` env var
//   3. `core` (the historical default — every existing invocation keeps
//      working without changes)

export type SeaTarget = 'core' | 'frontend'

export const SEA_TARGETS = ['core', 'frontend'] as const

export function isSeaTarget(value: unknown): value is SeaTarget {
  return value === 'core' || value === 'frontend'
}

/** Parse a `--target <t>` / `--target=<t>` pair out of an argv list. */
export function parseTargetArg(argv: readonly string[]): SeaTarget | null {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--target') {
      const value = argv[i + 1]
      if (isSeaTarget(value)) {
        return value
      }
    } else if (arg.startsWith('--target=')) {
      const value = arg.slice('--target='.length)
      if (isSeaTarget(value)) {
        return value
      }
    }
  }
  return null
}

/**
 * Resolve the effective SEA target. CLI arg wins over env; env wins over
 * the core default.
 */
export function resolveSeaTarget(argv: readonly string[] = process.argv.slice(2)): SeaTarget {
  const fromArg = parseTargetArg(argv)
  if (fromArg !== null) {
    return fromArg
  }
  const fromEnv = process.env.SEA_TARGET
  if (isSeaTarget(fromEnv)) {
    return fromEnv
  }
  return 'core'
}
