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
