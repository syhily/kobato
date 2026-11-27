import { join, resolve } from 'node:path'

export const CORPUS_ID = 'zhwiki-20261101'
export const DUMP_FILE = `${CORPUS_ID}-pages-articles-multistream.xml.bz2`
export const DUMP_URL = `https://dumps.wikimedia.org/zhwiki/20261101/${DUMP_FILE}`

export const FIXTURE_ID_MOD = 2003
export const FIXTURE_ID_REM = 7
export const FIXTURE_PAGE_COUNT = 64
export const FIXTURE_MIN_CHARS = 1200

export const packageDir = resolve(import.meta.dirname, '..', '..')
export const cacheDir = join(packageDir, '.cache')
export const dumpPath = join(cacheDir, DUMP_FILE)
export const tableDir = join(packageDir, 'scripts', 'cjk-tables')
export const tablesFile = join(packageDir, 'src', 'unicode', 'cjk_tables.rs')
export const pagesDir = join(packageDir, 'tests', 'fixtures', 'pages')
