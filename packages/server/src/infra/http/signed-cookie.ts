import { parseCookieValue, serializeCookie } from '@kobato/server/infra/http/cookie'

export interface SignedCookieOptions {
  name: string
  secrets: string[]
  maxAge: number
  path: string
  httpOnly: boolean
  secure: boolean
  sameSite: 'lax' | 'strict' | 'none'
}

export interface SignedCookie {
  parse(cookieHeader: string | null): Promise<string | null>
  serializeValue(value: string, maxAge?: number): Promise<string>
  serializeExpired(): string
}

const textEncoder = new TextEncoder()
const strictUtf8Decoder = new TextDecoder('utf-8', { fatal: true })

function base64EncodeBytes(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
}

function base64DecodeBytes(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text)
  const bytes: Uint8Array<ArrayBuffer> = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

function hmacKey(secret: string, usages: KeyUsage[]): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', textEncoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, usages)
}

async function signPayload(payload: string, secret: string): Promise<string> {
  const key = await hmacKey(secret, ['sign'])
  const signature = await crypto.subtle.sign('HMAC', key, textEncoder.encode(payload))
  return `${payload}.${base64EncodeBytes(new Uint8Array(signature)).replace(/[=]+$/, '')}`
}

async function unsignPayload(signed: string, secret: string): Promise<string | null> {
  const index = signed.lastIndexOf('.')
  if (index === -1) {
    return null
  }
  const payload = signed.slice(0, index)
  const signature = signed.slice(index + 1)
  try {
    const key = await hmacKey(secret, ['verify'])
    const ok = await crypto.subtle.verify('HMAC', key, base64DecodeBytes(signature), textEncoder.encode(payload))
    return ok ? payload : null
  } catch {
    return null
  }
}

function encodeValue(value: string): string {
  return base64EncodeBytes(textEncoder.encode(JSON.stringify(value)))
}

function decodeValue(payload: string): string | null {
  try {
    const parsed: unknown = JSON.parse(strictUtf8Decoder.decode(base64DecodeBytes(payload)))
    return typeof parsed === 'string' && parsed !== '' ? parsed : null
  } catch {
    return null
  }
}

export function createSignedCookie(options: SignedCookieOptions): SignedCookie {
  if (options.secrets.length === 0) {
    throw new Error('createSignedCookie requires at least one secret')
  }
  return {
    async parse(cookieHeader) {
      if (!cookieHeader) {
        return null
      }
      const raw = parseCookieValue(cookieHeader, options.name)
      if (!raw) {
        return null
      }
      for (const secret of options.secrets) {
        const payload = await unsignPayload(raw, secret)
        if (payload !== null) {
          return decodeValue(payload)
        }
      }
      return null
    },
    async serializeValue(value, maxAge) {
      const signed = await signPayload(encodeValue(value), options.secrets[0])
      return serializeCookie(options.name, signed, {
        maxAge: maxAge ?? options.maxAge,
        path: options.path,
        httpOnly: options.httpOnly,
        secure: options.secure,
        sameSite: options.sameSite,
      })
    },
    serializeExpired() {
      return serializeCookie(options.name, '', {
        expires: new Date(0),
        path: options.path,
        httpOnly: options.httpOnly,
        secure: options.secure,
        sameSite: options.sameSite,
      })
    },
  }
}
