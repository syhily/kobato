import { SmtpCapture, type CapturedMail } from '@kobato/harness/smtp.ts'
import { invalidateMailTransportCache } from '@kobato/server/infra/email/sender.ts'
import { BLOG_SETTINGS_SNAPSHOT_SLOT } from '@kobato/settings/snapshot.ts'
import { setBlogSettingsBundleForTests, TEST_BLOG_SETTINGS_BUNDLE } from '@tests/utils/blog-settings.ts'
import { createServer } from 'node:net'

export interface CaptureMailFixture {
  /** The in-process SMTP capture server's port. */
  readonly port: number
  /** A loopback port with no listener — a real ECONNREFUSED dial. */
  readonly deadPort: number
  /** Point mail settings at the capture server (and drop cached transports). */
  useCapture(): void
  /** Override ONLY the mail section on the currently-installed bundle. */
  applyCaptureMail(): void
  /** Point mail settings at the dead port — every send fails for real. */
  useDeadTransport(): void
  /** Restore the default test bundle and drop cached transports. */
  restore(): void
  /** Drop any buffered messages (between tests in a file). */
  drain(): Promise<void>
  /** The next message that actually arrived at the capture server. */
  nextMessage(timeoutMs?: number): Promise<CapturedMail>
  /** True when NO message arrived within the window. */
  noMessage(timeoutMs?: number): Promise<boolean>
  /** Close the capture server. */
  close(): Promise<void>
}

function bundleWithSmtp(port: number) {
  return {
    ...TEST_BLOG_SETTINGS_BUNDLE,
    mail: {
      mail: {
        ...TEST_BLOG_SETTINGS_BUNDLE.mail!.mail,
        enabled: true,
        sender: 'noreply@example.com',
        transport: 'smtp' as const,
        smtpHost: '127.0.0.1',
        smtpPort: port,
        smtpUser: 'test',
        smtpPass: 'test',
        smtpSecure: false,
        smtpRequireTls: false,
        smtpRejectUnauthorized: false,
      },
    },
  }
}

function decodeQuotedPrintable(body: string): string {
  const joined = body.replace(/[=]\r?\n/g, '')
  const bytes = joined.replace(/[=]([0-9A-Fa-f]{2})/g, (_, hex: string) =>
    String.fromCharCode(Number.parseInt(hex, 16)),
  )
  return Buffer.from(bytes, 'binary').toString('utf8')
}

function decodeMimeWords(header: string): string {
  // Whitespace between adjacent encoded words is a transport artifact (RFC 2047).
  const joined = header.replace(/[?]=\s+[=][?]/g, '?==?')
  return joined.replace(
    /[=][?]([^?]+)\?([BbQq])\?([^?]*)\?[=]/g,
    (_, _charset: string, encoding: string, payload: string) => {
      if (encoding.toLowerCase() === 'b') {
        return Buffer.from(payload, 'base64').toString('utf8')
      }
      return decodeQuotedPrintable(payload.replace(/_/g, ' '))
    },
  )
}

export interface ParsedMail {
  from: string
  to: string
  subject: string
  body: string
}

/** The next captured message, fully decoded: headers parsed, QP/base64 body decoded. */
export async function parseMail(fixture: CaptureMailFixture, timeoutMs?: number): Promise<ParsedMail> {
  const captured = await fixture.nextMessage(timeoutMs)
  const separator = /\r?\n\r?\n/.exec(captured.raw)
  const headerBlock = separator ? captured.raw.slice(0, separator.index) : captured.raw
  const body = separator ? captured.raw.slice((separator.index ?? 0) + separator[0].length) : ''
  // RFC 5322 unfolding first: continuation lines (leading space/tab) join the
  // previous line, then each header is a plain single-line match.
  const unfolded: string[] = []
  for (const line of headerBlock.split(/\r?\n/)) {
    if (/^[ \t]/.test(line) && unfolded.length > 0) {
      unfolded[unfolded.length - 1] += ` ${line.trim()}`
    } else {
      unfolded.push(line)
    }
  }
  const unfoldedBlock = unfolded.join('\r\n')
  const header = (name: string): string => {
    const match = new RegExp(`^${name}:\\s*(.*)$`, 'mi').exec(unfoldedBlock)
    return match ? decodeMimeWords(match[1]!.trim()).replace(/\s{2,}/g, ' ') : ''
  }
  const decoded = /Content-Transfer-Encoding: base64/i.test(headerBlock)
    ? Buffer.from(
        body
          .split(/\r?\n\r?\n/)
          .slice(1)
          .join('')
          .replace(/[^A-Za-z0-9+/=]/g, ''),
        'base64',
      ).toString('utf8')
    : decodeQuotedPrintable(body)
  return { from: header('From'), to: header('To'), subject: header('Subject'), body: decoded.replace(/&amp;/g, '&') }
}

export async function createCaptureMailFixture(): Promise<CaptureMailFixture> {
  const capture = new SmtpCapture()
  const port = await capture.start()
  const deadPort = await new Promise<number>((resolve, reject) => {
    const probe = createServer()
    probe.once('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const { port: chosen } = probe.address() as { port: number }
      probe.close(() => resolve(chosen))
    })
  })
  return {
    port,
    deadPort,
    useCapture() {
      setBlogSettingsBundleForTests(bundleWithSmtp(port))
      invalidateMailTransportCache()
    },
    applyCaptureMail() {
      const current = BLOG_SETTINGS_SNAPSHOT_SLOT.read()
      if (current === null) {
        throw new Error('capture-mail: no settings bundle installed to apply the mail section onto')
      }
      setBlogSettingsBundleForTests({ ...current, mail: bundleWithSmtp(port).mail })
      invalidateMailTransportCache()
    },
    useDeadTransport() {
      setBlogSettingsBundleForTests(bundleWithSmtp(deadPort))
      invalidateMailTransportCache()
    },
    restore() {
      setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
      invalidateMailTransportCache()
    },
    async drain() {
      for (;;) {
        try {
          await capture.nextMessage(1)
        } catch {
          return
        }
      }
    },
    nextMessage(timeoutMs = 5_000) {
      return capture.nextMessage(timeoutMs)
    },
    async noMessage(timeoutMs = 300) {
      try {
        await capture.nextMessage(timeoutMs)
        return false
      } catch {
        return true
      }
    },
    close() {
      return capture.close()
    },
  }
}
