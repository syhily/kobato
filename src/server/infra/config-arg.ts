// Side-effect-free `--config` argv parsing shared by config.ts and
// sea-cli.ts. sea-cli must stay side-effect-light for --version/--help, so
// it cannot import config.ts (which evaluates loadServerConfig() at module
// scope) — this module is the shared seam.

/**
 * Extract the explicit config path from `--config <path>`, `-c <path>`, or
 * `--config=<path>`; first occurrence wins. Returns undefined when absent —
 * `--config`/`-c` without a value also yields undefined (the caller decides
 * how to fail).
 */
export function parseConfigArg(argv: string[]): string | undefined {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--config' || arg === '-c') {
      return argv[i + 1]
    }
    if (arg.startsWith('--config=')) {
      return arg.slice('--config='.length)
    }
  }
  return undefined
}
