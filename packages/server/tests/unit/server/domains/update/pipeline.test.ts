import { assertDownloadSize, parseSha256Sidecar, runSelfUpdate } from '@kobato/server/domains/update/pipeline.ts'
import { DomainError } from '@kobato/server/infra/http/errors.ts'
import { createServerTranslator } from '@kobato/server/infra/i18n.ts'
import { createHash } from 'node:crypto'
import { chmodSync } from 'node:fs'
import { chmod, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const OLD_BINARY = 'old-binary-v1'
const NEW_BINARY = 'new-binary-v2-payload'

const fetchMock = vi.fn()

function sha256(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex')
}

function makeTarGz(name: string, payload: string, typeFlag = '0'): Buffer {
  const data = Buffer.from(payload)
  const header = Buffer.alloc(512)
  header.write(name, 0, 'latin1')
  header.write('0000755\0', 100, 'latin1')
  header.write('0000000\0', 108, 'latin1')
  header.write('0000000\0', 116, 'latin1')
  header.write(`${data.length.toString(8).padStart(11, '0')}\0`, 124, 'latin1')
  header.write('00000000000\0', 136, 'latin1')
  header.write('        ', 148, 'latin1')
  header.write(typeFlag, 156, 'latin1')
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

function serveUpdate(payload: string | Buffer, sidecars: { archiveShaText?: string; binaryShaText?: string } = {}) {
  const binaryName = `kobato-linux-${process.arch}`
  const archive = typeof payload === 'string' ? makeTarGz(binaryName, payload) : payload
  const archiveHash = sha256(archive)
  const binaryHash = typeof payload === 'string' ? sha256(Buffer.from(payload)) : '0'.repeat(64)
  fetchMock.mockImplementation(async (input: unknown) => {
    const url = String(input)
    if (url.endsWith('.tar.gz.sha256')) {
      return new Response(sidecars.archiveShaText ?? `${archiveHash}  ${binaryName}.tar.gz\n`)
    }
    if (url.endsWith('.sha256')) {
      return new Response(sidecars.binaryShaText ?? `${binaryHash}  ${binaryName}\n`)
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
    expect(urls[2]).toContain(`/releases/download/v9.9.9/kobato-linux-${process.arch}.sha256`)
  })

  it('aborts on sha256 mismatch without touching the live binary', async () => {
    serveUpdate(NEW_BINARY, { archiveShaText: `${'0'.repeat(64)}  kobato-linux-${process.arch}.tar.gz\n` })

    await expect(runSelfUpdate({ tagName: 'v9.9.9', execPath })).rejects.toMatchObject({
      descriptor: { messageKey: 'update.error.archiveHashMismatch' },
    })

    expect(await readFile(execPath, 'utf8')).toBe('old-binary-v1')
    await expect(stat(`${execPath}.bak`)).rejects.toThrow()
    expect(await readdir(dir)).not.toContain('.kobato-update')
  })

  it('aborts when the extracted binary fails its own checksum', async () => {
    serveUpdate(NEW_BINARY, { binaryShaText: `${'1'.repeat(64)}  kobato-linux-${process.arch}\n` })

    await expect(runSelfUpdate({ tagName: 'v9.9.9', execPath })).rejects.toMatchObject({
      descriptor: { messageKey: 'update.error.binaryHashMismatch' },
    })

    expect(await readFile(execPath, 'utf8')).toBe('old-binary-v1')
    await expect(stat(`${execPath}.bak`)).rejects.toThrow()
    expect(await readdir(dir)).not.toContain('.kobato-update')
  })

  it('aborts on a corrupt archive without touching the live binary', async () => {
    serveUpdate(Buffer.from('not-a-gzip-archive'))

    await expect(runSelfUpdate({ tagName: 'v9.9.9', execPath })).rejects.toMatchObject({
      descriptor: { messageKey: 'update.error.extractFailed' },
    })

    expect(await readFile(execPath, 'utf8')).toBe('old-binary-v1')
    await expect(stat(`${execPath}.bak`)).rejects.toThrow()
    expect(await readdir(dir)).not.toContain('.kobato-update')
  })

  it('aborts on download HTTP failure without touching the live binary', async () => {
    fetchMock.mockResolvedValue(new Response('not found', { status: 404 }))

    const error = await runSelfUpdate({ tagName: 'v9.9.9', execPath }).catch((err: unknown) => err)
    expect(error).toBeInstanceOf(DomainError)
    expect((error as DomainError).code).toBe('INTERNAL')
    expect((error as DomainError).descriptor).toEqual(
      expect.objectContaining({
        messageKey: 'update.error.downloadFailed',
        params: { status: 404 },
        fallbackMessage: 'Downloading the update package failed (HTTP 404)',
      }),
    )
    expect((error as DomainError).message).toBe('Downloading the update package failed (HTTP 404)')
    expect((error as DomainError).message).not.toMatch(/[\u3400-\u4DBF\u4E00-\u9FFF]/)

    expect(await readFile(execPath, 'utf8')).toBe('old-binary-v1')
    await expect(stat(`${execPath}.bak`)).rejects.toThrow()
    expect(await readdir(dir)).not.toContain('.kobato-update')
  })

  it('restores the live binary when the swap fails after backup', async () => {
    const stageDir = join(dir, '.kobato-update')
    serveUpdate(NEW_BINARY)

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

    expect(await readFile(execPath, 'utf8')).toBe('old-binary-v1')
    await expect(stat(`${execPath}.bak`)).rejects.toThrow()

    await chmod(stageDir, 0o755)
  })

  it('parses the sha256 sidecar format produced by sea.yml', () => {
    const hash = 'a'.repeat(64)
    expect(parseSha256Sidecar(`${hash}  kobato-linux-x64.tar.gz\n`)).toBe(hash)
    expect(parseSha256Sidecar(`${hash} kobato-linux-arm64.tar.gz`)).toBe(hash)
    expect(parseSha256Sidecar(`${hash.toUpperCase()}  kobato-linux-x64.tar.gz`)).toBe(hash)
  })

  it('rejects malformed sha256 sidecars', () => {
    expect(() => parseSha256Sidecar('not-a-hash  kobato')).toThrow(
      expect.objectContaining({ descriptor: expect.objectContaining({ messageKey: 'update.error.sidecarInvalid' }) }),
    )
    expect(() => parseSha256Sidecar('')).toThrow(
      expect.objectContaining({ descriptor: expect.objectContaining({ messageKey: 'update.error.sidecarInvalid' }) }),
    )
  })

  it('reports a served sidecar that does not parse as a descriptor, not raw prose', async () => {
    serveUpdate(NEW_BINARY, { archiveShaText: 'garbage\n' })

    await expect(runSelfUpdate({ tagName: 'v9.9.9', execPath })).rejects.toMatchObject({
      descriptor: { messageKey: 'update.error.sidecarInvalid' },
    })
    expect(await readFile(execPath, 'utf8')).toBe('old-binary-v1')
  })

  it('reports a sidecar download HTTP failure with its status', async () => {
    serveUpdate(NEW_BINARY)
    const serve = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation(async (input: unknown) => {
      if (String(input).endsWith('.tar.gz.sha256')) {
        return new Response('nope', { status: 502 })
      }
      return serve(input)
    })

    await expect(runSelfUpdate({ tagName: 'v9.9.9', execPath })).rejects.toMatchObject({
      descriptor: { messageKey: 'update.error.sidecarDownloadFailed', params: { status: 502 } },
    })
    expect(await readFile(execPath, 'utf8')).toBe('old-binary-v1')
  })

  it('reports a missing executable inside a well-formed archive', async () => {
    serveUpdate(makeTarGz(`kobato-linux-${process.arch}/`, '', '5'))

    await expect(runSelfUpdate({ tagName: 'v9.9.9', execPath })).rejects.toMatchObject({
      descriptor: { messageKey: 'update.error.binaryMissing' },
    })
    expect(await readFile(execPath, 'utf8')).toBe('old-binary-v1')
    await expect(stat(`${execPath}.bak`)).rejects.toThrow()
  })

  it('size cap: reports the descriptor with the formatted ceiling', () => {
    expect(() => assertDownloadSize(101, 100)).toThrow(
      expect.objectContaining({
        descriptor: expect.objectContaining({
          messageKey: 'update.error.packageTooLarge',
          params: { max: '100 bytes' },
        }),
      }),
    )
    expect(() => assertDownloadSize(4 * 1024 * 1024, 4 * 1024 * 1024)).not.toThrow()
    try {
      assertDownloadSize(512 * 1024 * 1024 + 1)
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError)
      expect((error as DomainError).descriptor).toMatchObject({
        messageKey: 'update.error.packageTooLarge',
        params: { max: '512 MB' },
      })
      expect((error as DomainError).message).toBe(
        createServerTranslator('en-US').format('update.error.packageTooLarge', { max: '512 MB' }),
      )
      expect((error as DomainError).message).not.toMatch(/[\u3400-\u4DBF\u4E00-\u9FFF]/)
    }
  })
})
