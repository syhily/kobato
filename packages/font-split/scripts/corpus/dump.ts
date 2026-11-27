import { charFromCodepoint, parseUnsigned, trimWhiteSpace } from '@kobato/font-split/scripts/corpus/clean'
import { DUMP_URL, dumpPath, packageDir } from '@kobato/font-split/scripts/corpus/profile'
import { spawn, spawnSync } from 'node:child_process'
import { mkdir, stat } from 'node:fs/promises'
import { dirname } from 'node:path'

export interface RawPage {
  id: number
  ns: number
  redirect: boolean
  text: string
}

export interface PageBytes {
  id: number
  ns: number
  redirect: boolean
  bytes: Uint8Array<ArrayBuffer>
}

const UTF8 = new TextDecoder('utf-8', { ignoreBOM: true })

async function fileSize(path: string): Promise<number | null> {
  try {
    const info = await stat(path)
    return info.size
  } catch {
    return null
  }
}

async function remoteSize(url: string): Promise<number | null> {
  try {
    const response = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(30_000) })
    const length = Number(response.headers.get('content-length'))
    return response.ok && Number.isSafeInteger(length) && length > 0 ? length : null
  } catch {
    return null
  }
}

export async function download(): Promise<void> {
  await mkdir(dirname(dumpPath), { recursive: true })
  const local = await fileSize(dumpPath)
  const remote = await remoteSize(DUMP_URL)
  if (local !== null && local === remote) {
    console.log(`already downloaded: ${dumpPath} (${local} bytes)`)
    return
  }
  console.log(`downloading ${DUMP_URL}\n  -> ${dumpPath}`)
  const status = spawnSync('curl', ['-fL', '-C', '-', '--retry', '3', '-o', dumpPath, DUMP_URL], {
    cwd: packageDir,
    stdio: ['ignore', 'ignore', 'inherit'],
  })
  if (status.error) {
    throw status.error
  }
  if (status.status !== 0) {
    throw new Error(`curl failed with exit code ${status.status}`)
  }
  const size = await fileSize(dumpPath)
  console.log(`done: ${size ?? 0} bytes`)
}

function extractTag(blob: Buffer, open: string, close: string): Buffer | null {
  const start = blob.indexOf(open)
  if (start === -1) {
    return null
  }
  const end = blob.indexOf(close, start + open.length)
  return end === -1 ? null : blob.subarray(start + open.length, end)
}

function integerOf(blob: Buffer | null, fallback: number, signed: boolean): number {
  const text = blob === null ? '' : trimWhiteSpace(blob.toString('utf8'))
  if (!(signed ? /^[+-]?\d+$/ : /^\+?\d+$/).test(text)) {
    return fallback
  }
  const value = Number(text)
  return Number.isSafeInteger(value) ? value : fallback
}

const EMPTY: Uint8Array = new Uint8Array(0)

function extractText(blob: Buffer): Uint8Array {
  const tag = blob.indexOf('<text')
  if (tag === -1) {
    return EMPTY
  }
  const tagEnd = blob.indexOf('>', tag)
  if (tagEnd === -1 || blob[tagEnd - 1] === 0x2f) {
    return EMPTY
  }
  const close = blob.indexOf('</text>', tagEnd + 1)
  return close === -1 ? EMPTY : blob.subarray(tagEnd + 1, close)
}

export function splitPage(blob: Buffer): PageBytes {
  const title = extractTag(blob, '<title>', '</title>') ?? EMPTY
  const text = extractText(blob)
  const bytes = new Uint8Array(new ArrayBuffer(title.length + 1 + text.length))
  bytes.set(title, 0)
  bytes[title.length] = 0x0a
  bytes.set(text, title.length + 1)
  return {
    id: integerOf(extractTag(blob, '<id>', '</id>'), 0, false),
    ns: integerOf(extractTag(blob, '<ns>', '</ns>'), -1, true),
    redirect: blob.includes('<redirect'),
    bytes,
  }
}

const XML_NAMED = new Map([
  ['lt', '<'],
  ['gt', '>'],
  ['amp', '&'],
  ['quot', '"'],
  ['apos', "'"],
])

function xmlEntity(entity: string): string | null {
  if (!entity.startsWith('#')) {
    return XML_NAMED.get(entity) ?? null
  }
  const hex = ['#x', '#X'].includes(entity.slice(0, 2))
  return charFromCodepoint(parseUnsigned(entity.slice(hex ? 2 : 1), hex ? 16 : 10))
}

export function xmlUnescape(s: string): string {
  if (!s.includes('&')) {
    return s
  }
  let out = ''
  let rest = s
  let at = rest.indexOf('&')
  while (at !== -1) {
    const semi = rest.indexOf(';', at + 1)
    if (semi === -1) {
      return `${out}${rest.slice(0, at)}&${rest.slice(at + 1)}`
    }
    const entity = rest.slice(at + 1, semi)
    out += `${rest.slice(0, at)}${xmlEntity(entity) ?? `&${entity};`}`
    rest = rest.slice(semi + 1)
    at = rest.indexOf('&')
  }
  return out + rest
}

export function pageText(bytes: Uint8Array): string {
  return xmlUnescape(UTF8.decode(bytes))
}

export function parsePage(blob: Buffer): RawPage {
  const { id, ns, redirect, bytes } = splitPage(blob)
  return { id, ns, redirect, text: pageText(bytes) }
}

export class PageAssembler {
  private pending: Buffer = Buffer.alloc(0)

  push(chunk: Uint8Array): PageBytes[] {
    this.pending =
      this.pending.length === 0
        ? Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength)
        : Buffer.concat([this.pending, chunk])
    const pages: PageBytes[] = []
    let open = this.pending.indexOf('<page>')
    while (open !== -1) {
      const close = this.pending.indexOf('</page>', open)
      if (close === -1) {
        break
      }
      pages.push(splitPage(this.pending.subarray(open, close + 7)))
      this.pending = this.pending.subarray(close + 7)
      open = this.pending.indexOf('<page>')
    }
    return pages
  }
}

export async function* pageStream(path: string): AsyncGenerator<PageBytes> {
  const child = spawn('bzip2', ['-dc', path], { stdio: ['ignore', 'pipe', 'inherit'] })
  const exited = new Promise<number | null>((resolve) => child.once('close', resolve))
  child.once('error', (error) => child.stdout.destroy(error))
  try {
    const assembler = new PageAssembler()
    for await (const chunk of child.stdout) {
      for (const page of assembler.push(chunk)) {
        yield page
      }
    }
    const code = await exited
    if (code !== 0) {
      throw new Error(`bzip2 -dc exited with code ${code ?? 'signal'}`)
    }
  } finally {
    child.kill()
    await exited
  }
}
