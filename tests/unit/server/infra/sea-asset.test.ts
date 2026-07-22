import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { readAssetTextOrDisk, requireEmbeddedAssetText } from '@/server/infra/sea-asset'

// Unit tests for the SEA/disk asset text reader. Vitest never runs as a
// single executable, so `readAssetTextOrDisk` always takes the disk path
// here; the SEA branch degrades to null via `getEmbeddedAsset`.

const tmpDirs: string[] = []

function makeTmpDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'kobato-sea-asset-test-'))
  tmpDirs.push(dir)
  return dir
}

afterEach(() => {
  while (tmpDirs.length > 0) {
    rmSync(tmpDirs.pop()!, { recursive: true, force: true })
  }
})

describe('infra/sea-asset — readAssetTextOrDisk', () => {
  it('reads the disk file as UTF-8 when not running as a SEA', () => {
    const dir = makeTmpDir()
    const diskPath = join(dir, 'asset.json')
    writeFileSync(diskPath, '{"ok":true}\n')
    expect(readAssetTextOrDisk('client/assets/asset.json', diskPath)).toBe('{"ok":true}\n')
  })

  it('returns null when the disk file is missing', () => {
    const dir = makeTmpDir()
    expect(readAssetTextOrDisk('client/assets/missing.json', join(dir, 'missing.json'))).toBeNull()
  })
})

describe('infra/sea-asset — requireEmbeddedAssetText', () => {
  it('decodes the asset as UTF-8 text', () => {
    expect(requireEmbeddedAssetText(Buffer.from('select 1;'), 'unused')).toBe('select 1;')
  })

  it('throws the caller-supplied message when the asset is missing', () => {
    expect(() => requireEmbeddedAssetText(null, 'Embedded migration asset missing: drizzle/x/migration.sql')).toThrow(
      'Embedded migration asset missing: drizzle/x/migration.sql',
    )
  })
})
