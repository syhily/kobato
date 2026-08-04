// Shared argv helpers for the SEA orchestrator CLI entry points
// (scripts/sea/smoke.ts, scripts/sea/e2e.ts). Same conventions as the
// other shared modules here (target.ts, exec.ts): plain relative imports
// — these scripts run under plain `node` (no tsconfig path aliases).

/**
 * The first positional (non-flag) argument — the binary path after
 * `--target <t>` / `--core-url <url>` etc. Skips the values of known
 * flag arguments so `--target frontend dist-sea/kobato-frontend` resolves
 * the binary correctly.
 *
 * `skipNext` lists the flags whose VALUE must be skipped (e.g. `--target`
 * consumes the next argument). Unknown flags skip only themselves — their
 * value is treated as the first positional.
 */
export function firstPositionalArg(args: readonly string[], skipNext: ReadonlySet<string>): string | null {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg.startsWith('--')) {
      if (skipNext.has(arg)) {
        i++
      }
      continue
    }
    return arg
  }
  return null
}
