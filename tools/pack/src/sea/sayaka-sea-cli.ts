import { installSeaVfsRuntimePatches } from '@kobato/pack/sea/sayaka-sea-vfs-fs-patch'

declare const __SEA_APP_VERSION__: string

const USAGE = `sayaka — the public front end of Kobato (single executable)

Usage:
  sayaka                   Start the server
  sayaka --version, -v     Print the version and exit
  sayaka --help, -h        Print this help and exit

Configuration (environment variables):
  SAYAKA_HOST              Bind address (default: 0.0.0.0)
  SAYAKA_PORT              Listen port (default: 4322)
  SAYAKA_KOBATO_RPC_URL    Full RPC URL of the kobato backend
                           (required in a production build)
  SAYAKA_TRUSTED_PROXIES   Comma-separated trusted proxy IPs / CIDRs
`

async function main(args: ReadonlySet<string>): Promise<void> {
  if (args.has('--version') || args.has('-v')) {
    process.stdout.write(`sayaka ${__SEA_APP_VERSION__}\n`)
  } else if (args.has('--help') || args.has('-h')) {
    process.stdout.write(USAGE)
  }
}

const args = new Set(process.argv.slice(2))
const isFlagInvocation = args.has('--version') || args.has('-v') || args.has('--help') || args.has('-h')

installSeaVfsRuntimePatches()

if (isFlagInvocation) {
  try {
    await main(args)
  } catch (error) {
    process.stderr.write(`sayaka: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`)
    process.exit(1)
  }
  process.exit(0)
}
