// Frontend SEA command-line surface — evaluates FIRST in the injected
// frontend server bundle (see `scripts/sea/server-entry-frontend.ts` for
// the evaluation-order contract). The frontend binary is the official
// public SSR service; its CLI is deliberately minimal:
//
//   kobato-frontend --version | -v    print the baked-in version and exit
//   kobato-frontend --help | -h       print usage and exit
//   (anything else)                   fall through — the public server
//                                     graph evaluates next
//
// Core-only flags (--smoke-natives, --smoke-worker, rollback, doctor)
// have no frontend counterpart: the frontend ships no native libraries,
// no image worker, and no self-update pipeline (the plan keeps
// self-update core-only — frontend deployments roll via compose/编排
// replacing the binary).
//
// --version/--help exit here with ZERO side effects (no config graph
// evaluation) — they must stay ahead of the server graph, which
// validates the configuration at module scope. Nothing in this module
// may touch the env-validated graph: it imports node builtins and the
// vite `define` global only.

// Baked at build time by vite (`define` in vite.sea.config.ts) from
// apps/core/package.json — a single executable has no package.json to
// read at runtime. The `declare const` emits no code; only usage sites
// are replaced.
declare const __SEA_APP_VERSION__: string

const USAGE = `kobato-frontend — Kobato official frontend (public SSR service)

Usage:
  kobato-frontend               Start the public SSR server (see configuration below)
  kobato-frontend --version, -v Print the version and exit
  kobato-frontend --help, -h    Print this help and exit

The frontend is the official theme: it serves the public pages and talks
to a Kobato core server over HTTP. Core-only capabilities (image
processing, analytics, self-update) do not exist in this binary.

Configuration:
  PORT                     HTTP listen port (default: 4322).
  CORE_API_URL             Base URL of the Kobato core server this frontend
                           serves against (http://core:4321 in the compose
                           topology). Reported by GET /health.
  PUBLIC_URL               The frontend's own public origin (reserved for
                           absolute-URL generation).
  KOBATO_FRONTEND_PRIVATE_KEY / KOBATO_FRONTEND_KEY_ID
                           Ed25519 credentials for the /rpc write-proxy
                           trust chain (optional: without them the proxy
                           forwards anonymous writes but core ignores
                           every forwarding header).
`

const args = new Set(process.argv.slice(2))
const isFlagInvocation = args.has('--version') || args.has('-v') || args.has('--help') || args.has('-h')

if (isFlagInvocation) {
  if (args.has('--version') || args.has('-v')) {
    process.stdout.write(`kobato-frontend ${__SEA_APP_VERSION__}\n`)
  } else {
    process.stdout.write(USAGE)
  }
  process.exit(0)
}
