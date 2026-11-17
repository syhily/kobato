// SMTP capture server for tests/e2e — the mail seam OTP / magic-link
// journeys extract their secrets from; nothing ever leaves the machine.
// Speaks just enough SMTP for nodemailer's plaintext path.

import { createServer, type Server, type Socket } from 'node:net'

export interface CapturedMail {
  from: string
  to: string
  /** Raw DATA payload (headers + body, CRLF line endings, dot-terminated). */
  raw: string
}

const CAPTURE_HOST = '127.0.0.1'

export class SmtpCapture {
  private readonly server: Server
  private readonly messages: CapturedMail[] = []
  private waiters: Array<(mail: CapturedMail) => void> = []
  private readonly sockets = new Set<Socket>()

  constructor() {
    this.server = createServer((socket) => this.handle(socket))
  }

  /** Bind on an ephemeral loopback port; returns the chosen port. */
  start(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server.once('error', reject)
      this.server.listen(0, CAPTURE_HOST, () => {
        const address = this.server.address()
        if (address === null || typeof address === 'string') {
          reject(new Error('SMTP capture listen returned no port'))
          return
        }
        resolve(address.port)
      })
    })
  }

  async close(): Promise<void> {
    for (const socket of this.sockets) {
      socket.destroy()
    }
    await new Promise<void>((resolve) => this.server.close(() => resolve()))
  }

  /** The next captured message (or an already-buffered one), with a timeout. */
  nextMessage(timeoutMs = 15_000): Promise<CapturedMail> {
    const buffered = this.messages.shift()
    if (buffered !== undefined) {
      return Promise.resolve(buffered)
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((w) => w !== onMessage)
        reject(new Error(`no mail captured within ${timeoutMs / 1000}s`))
      }, timeoutMs)
      const onMessage = (mail: CapturedMail) => {
        clearTimeout(timer)
        resolve(mail)
      }
      this.waiters.push(onMessage)
    })
  }

  private deliver(mail: CapturedMail): void {
    const waiter = this.waiters.shift()
    if (waiter !== undefined) {
      waiter(mail)
    } else {
      this.messages.push(mail)
    }
  }

  private handle(socket: Socket): void {
    this.sockets.add(socket)
    socket.once('close', () => this.sockets.delete(socket))
    socket.setEncoding('latin1')

    let buffer = ''
    let inData = false
    let dataLines: string[] = []
    let mailFrom = ''
    let mailTo = ''

    const reply = (line: string) => socket.write(`${line}\r\n`)
    reply('220 capture.kobato.local ESMTP e2e capture')

    socket.on('data', (chunk: string) => {
      buffer += chunk
      for (;;) {
        const eol = buffer.indexOf('\r\n')
        if (eol === -1) {
          return
        }
        const line = buffer.slice(0, eol)
        buffer = buffer.slice(eol + 2)

        if (inData) {
          // A lone dot terminates DATA (dot-stuffing not exercised).
          if (line === '.') {
            inData = false
            this.deliver({ from: mailFrom, to: mailTo, raw: dataLines.join('\r\n') })
            dataLines = []
            mailFrom = ''
            mailTo = ''
            reply('250 2.0.0 Ok: queued')
          } else {
            dataLines.push(line)
          }
          continue
        }

        const verb = line.slice(0, 4).toUpperCase()
        if (verb === 'EHLO' || verb === 'HELO') {
          // No AUTH, no STARTTLS — nodemailer falls back to a plain send.
          reply('250-capture.kobato.local greets you')
          reply('250 SIZE 10485760')
        } else if (verb === 'MAIL') {
          mailFrom = line
          reply('250 2.1.0 Ok')
        } else if (verb === 'RCPT') {
          mailTo = line
          reply('250 2.1.5 Ok')
        } else if (verb === 'DATA') {
          inData = true
          reply('354 End data with <CR><LF>.<CR><LF>')
        } else if (verb === 'RSET' || verb === 'NOOP') {
          reply('250 2.0.0 Ok')
        } else if (verb === 'QUIT') {
          reply('221 2.0.0 Bye')
          socket.end()
        } else {
          reply('502 5.5.2 Command not implemented')
        }
      }
    })
  }
}

export function decodeMail(raw: string): string {
  const separator = raw.indexOf('\r\n\r\n')
  const headers = separator === -1 ? raw : raw.slice(0, separator)
  const body = separator === -1 ? '' : raw.slice(separator + 4)

  if (/content-transfer-encoding:\s*base64/i.test(headers)) {
    return Buffer.from(body.replace(/\r\n/g, ''), 'base64').toString('utf8')
  }
  if (/content-transfer-encoding:\s*quoted-printable/i.test(headers)) {
    const bytes: number[] = []
    for (let i = 0; i < body.length; i++) {
      const ch = body[i]!
      if (ch === '=') {
        // Soft line break.
        if (body[i + 1] === '\r' && body[i + 2] === '\n') {
          i += 2
          continue
        }
        const hex = body.slice(i + 1, i + 3)
        if (/^[0-9A-Fa-f]{2}$/.test(hex)) {
          bytes.push(Number.parseInt(hex, 16))
          i += 2
          continue
        }
      }
      // Non-ASCII travels as =XX octets — a latin1 read of the remainder is exact.
      bytes.push(ch.charCodeAt(0))
    }
    return Buffer.from(bytes).toString('utf8')
  }
  return body
}

/** The 6-digit sign-in code from a SignInOtp mail. */
export function extractOtpCode(mail: CapturedMail): string {
  const text = decodeMail(mail.raw)
  // The template renders `你的登录验证码是 <code>，` in the preview span.
  const preview = /验证码是\s*(\d{6})/.exec(text)
  if (preview !== null) {
    return preview[1]!
  }
  // Fallback: the code also stands alone inside the big display div.
  const standalone = />\s*(\d{6})\s*</.exec(text)
  if (standalone !== null) {
    return standalone[1]!
  }
  throw new Error('no 6-digit OTP code found in the captured mail')
}

/** The full signin URL (path + query) from a SignInLink mail. */
export function extractMagicLinkPath(mail: CapturedMail): string {
  const text = decodeMail(mail.raw)
  const href = /href="([^"]*action=magiclink[^"]*)"/.exec(text)
  if (href === null) {
    throw new Error('no magic-link href found in the captured mail')
  }
  const url = new URL(href[1]!.replaceAll('&amp;', '&'))
  return `${url.pathname}${url.search}`
}
