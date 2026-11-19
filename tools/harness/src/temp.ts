import { mkdir, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export interface TempDirs {
  root: string
  data: string
  cache: string
  cwd: string
}

export interface SmokeDatabases {
  database: string
  analytics: string
}

export function smokeDatabases(dirs: TempDirs): SmokeDatabases {
  return { database: join(dirs.data, 'kobato.db'), analytics: join(dirs.data, 'analytics.duckdb') }
}

export async function makeTempDirs(): Promise<TempDirs> {
  const root = await mkdtemp(join(tmpdir(), 'kobato-smoke-'))
  const dirs = { root, data: join(root, 'data'), cache: join(root, 'cache'), cwd: join(root, 'cwd') }
  await mkdir(dirs.data, { recursive: true })
  await mkdir(dirs.cache, { recursive: true })
  await mkdir(dirs.cwd, { recursive: true })
  return dirs
}
