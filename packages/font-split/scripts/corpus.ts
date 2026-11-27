import { blogPages } from '@kobato/font-split/scripts/corpus/blog'
import { build, defaultWorkers } from '@kobato/font-split/scripts/corpus/count'
import { download } from '@kobato/font-split/scripts/corpus/dump'
import { writeTables } from '@kobato/font-split/scripts/corpus/generate'

const USAGE = `usage: corpus <download|build|generate|blog-pages> [options]

  download                       fetch the zhwiki dump into .cache/ (resumable)
  build [--workers <n>]          one pass over the dump: char frequencies and held-out page fixtures
  generate                       regenerate src/unicode/cjk_tables.rs from scripts/cjk-tables/
  blog-pages <kobato.db> <out>   regenerate the production-blog page fixture from a Kobato content database`

function workersOf(args: readonly string[]): number {
  const flag = args.indexOf('--workers')
  if (flag === -1) {
    return defaultWorkers()
  }
  const value = Number(args[flag + 1])
  if (!Number.isInteger(value) || value < 1) {
    throw new Error('--workers needs a positive integer')
  }
  return value
}

async function main(argv: readonly string[]): Promise<number> {
  const [command, ...rest] = argv
  switch (command) {
    case 'download':
      await download()
      return 0
    case 'build':
      await build(workersOf(rest))
      return 0
    case 'generate':
      writeTables()
      return 0
    case 'blog-pages': {
      const [database, output] = rest
      if (database === undefined || output === undefined) {
        process.stderr.write('usage: corpus blog-pages <kobato.db> <output fixture>\n')
        return 2
      }
      blogPages(database, output)
      return 0
    }
    default:
      process.stderr.write(`${USAGE}\n`)
      return 2
  }
}

try {
  process.exitCode = await main(process.argv.slice(2))
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
}
