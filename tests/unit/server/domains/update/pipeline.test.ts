import { createHash } from 'node:crypto'
import { chmodSync } from 'node:fs'
import { chmod, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { parseSha256Sidecar, runSelfUpdate } from '@/server/domains/update/pipeline'

// Interface test for the self-update pipeline: real tmpdir, real fs — only
// `fetch` is mocked. Exercises stage → download → verify → extract → chmod →
// backup → swap through `runSelfUpdate`, never its internals.

const OLD_BINARY = 'old-binary-v1'
const NEW_BINARY = 'new-binary-v2-payload'

const fetchMock = vi.fn()

function sha256(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex')
}

// Builds the same archive shape sea.yml produces: a gzipped tar holding the
// single bare binary as its only entry.
function makeTarGz(name: string, payload: string): Buffer {
  const data = Buffer.from(payload)
  const header = Buffer.alloc(512)
  header.write(name, 0, 'latin1')
  header.write('0000755\0', 100, 'latin1') // mode
  header.write('0000000\0', 108, 'latin1') // uid
  header.write('0000000\0', 116, 'latin1') // gid
  header.write(`${data.length.toString(8).padStart(11, '0')}\0`, 124, 'latin1')
  header.write('00000000000\0', 136, 'latin1') // mtime
  header.write('        ', 148, 'latin1') // chksum field counts as spaces
  header.write('0', 156, 'latin1') // regular file
  header.write('ustar\0', 257, 'latin1')
  let sum = 0
  for (const byte of header) {
    sum += byte
  }
  header.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148, 'latin1')
  const padding = Buffer.alloc((512 - (data.length % 512)) % 512)
  const end = Buffer.alloc(1024)
  return gzipSync(Buffer.concat([header, data, padding, end]))
}

function serveUpdate(payload: string | Buffer, shaText?: string) {
  const binaryName = `kobato-linux-${process.arch}`
  const archive = typeof payload === 'string' ? makeTarGz(binaryName, payload) : payload
  const hash = sha256(archive)
  fetchMock.mockImplementation(async (input: unknown) => {
    const url = String(input)
    if (url.endsWith('.sha256')) {
      return new Response(shaText ?? `${hash}  ${binaryName}.tar.gz\n`)
    }
    return new Response(new Uint8Array(archive))
  })
}

describe('update/pipeline', () => {
  let dir: string
  let execPath: string

  beforeEach(async () => {
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockReset()
    dir = await mkdtemp(join(tmpdir(), 'kobato-update-'))
    execPath = join(dir, 'kobato')
    await writeFile(execPath, OLD_BINARY, { mode: 0o755 })
  })

  afterEach(async () => {
    vi.unstubAllGlobals()
    await chmod(dir, 0o755).catch(() => undefined)
    await rm(dir, { recursive: true, force: true })
  })

  it('downloads, verifies, swaps and keeps a .bak sibling', async () => {
    serveUpdate(NEW_BINARY)
    const states: string[] = []

    await runSelfUpdate({ tagName: 'v9.9.9', execPath, onState: (s) => states.push(s) })

    expect(await readFile(execPath, 'utf8')).toBe('new-binary-v2-payload')
    expect(await readFile(`${execPath}.bak`, 'utf8')).toBe('old-binary-v1')
    expect((await stat(execPath)).mode & 0o777).toBe(0o755)
    expect(await readdir(dir)).not.toContain('.kobato-update')
    expect(states).toEqual(['downloading', 'verifying', 'swapping'])

    const urls = fetchMock.mock.calls.map((call) => String(call[0]))
    expect(urls[0]).toContain(`/releases/download/v9.9.9/kobato-linux-${process.arch}.tar.gz`)
    expect(urls[1]).toBe(`${urls[0]}.sha256`)
  })

  it('aborts on sha256 mismatch without touching the live binary', async () => {
    serveUpdate(NEW_BINARY, `${'0'.repeat(64)}  kobato-linux-${process.arch}.tar.gz\n`)

    await expect(runSelfUpdate({ tagName: 'v9.9.9', execPath })).rejects.toThrow('校验失败')

    expect(await readFile(execPath, 'utf8')).toBe('old-binary-v1')
    await expect(stat(`${execPath}.bak`)).rejects.toThrow()
    expect(await readdir(dir)).not.toContain('.kobato-update')
  })

  it('aborts on a corrupt archive without touching the live binary', async () => {
    // The sha256 sidecar matches the (garbage) archive, so the failure must
    // surface at extraction time, after verification.
    serveUpdate(Buffer.from('not-a-gzip-archive'))

    await expect(runSelfUpdate({ tagName: 'v9.9.9', execPath })).rejects.toThrow('解压失败')

    expect(await readFile(execPath, 'utf8')).toBe('old-binary-v1')
    await expect(stat(`${execPath}.bak`)).rejects.toThrow()
    expect(await readdir(dir)).not.toContain('.kobato-update')
  })

  it('aborts on download HTTP failure without touching the live binary', async () => {
    fetchMock.mockResolvedValue(new Response('not found', { status: 404 }))

    await expect(runSelfUpdate({ tagName: 'v9.9.9', execPath })).rejects.toThrow('下载更新包失败')

    expect(await readFile(execPath, 'utf8')).toBe('old-binary-v1')
    await expect(stat(`${execPath}.bak`)).rejects.toThrow()
    expect(await readdir(dir)).not.toContain('.kobato-update')
  })

  it('restores the live binary when the swap fails after backup', async () => {
    const stageDir = join(dir, '.kobato-update')
    serveUpdate(NEW_BINARY)

    // Make the stage dir read-only once extraction is done so the swap
    // rename fails after the backup rename succeeded.
    await expect(
      runSelfUpdate({
        tagName: 'v9.9.9',
        execPath,
        onState: (state) => {
          if (state === 'swapping') {
            chmodSync(stageDir, 0o555)
          }
        },
      }),
    ).rejects.toThrow()

    // Best-effort restore: the original binary is back, the backup is gone.
    expect(await readFile(execPath, 'utf8')).toBe('old-binary-v1')
    await expect(stat(`${execPath}.bak`)).rejects.toThrow()

    // The read-only stage dir survives the best-effort cleanup; reset it
    // so afterEach can remove the tmpdir.
    await chmod(stageDir, 0o755)
  })

  it('parses the sha256 sidecar format produced by sea.yml', () => {
    const hash = 'a'.repeat(64)
    expect(parseSha256Sidecar(`${hash}  kobato-linux-x64.tar.gz\n`)).toBe(hash)
    expect(parseSha256Sidecar(`${hash} kobato-linux-arm64.tar.gz`)).toBe(hash)
    expect(parseSha256Sidecar(`${hash.toUpperCase()}  kobato-linux-x64.tar.gz`)).toBe(hash)
  })

  it('rejects malformed sha256 sidecars', () => {
    expect(() => parseSha256Sidecar('not-a-hash  kobato')).toThrow('校验文件格式无效')
    expect(() => parseSha256Sidecar('')).toThrow('校验文件格式无效')
  })
})
