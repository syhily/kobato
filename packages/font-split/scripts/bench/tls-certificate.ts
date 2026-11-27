import { createPrivateKey, generateKeyPairSync, randomBytes, sign, X509Certificate } from 'node:crypto'

export interface TlsMaterial {
  key: string
  cert: string
}

const SUBJECT = 'kobato-bench'
const VALIDITY_MS = 24 * 60 * 60 * 1000
const OID_COMMON_NAME = [0x55, 0x04, 0x03]
const OID_ECDSA_SHA256 = [0x2a, 0x86, 0x48, 0xce, 0x3d, 0x04, 0x03, 0x02]
const OID_SUBJECT_ALT_NAME = [0x55, 0x1d, 0x11]

function lengthBytes(length: number): number[] {
  if (length < 0x80) {
    return [length]
  }
  const bytes: number[] = []
  for (let value = length; value > 0; value >>= 8) {
    bytes.unshift(value & 0xff)
  }
  return [0x80 | bytes.length, ...bytes]
}

function tlv(tag: number, content: Buffer): Buffer {
  return Buffer.concat([Buffer.from([tag, ...lengthBytes(content.length)]), content])
}

const sequence = (...parts: Buffer[]): Buffer => tlv(0x30, Buffer.concat(parts))
const set = (...parts: Buffer[]): Buffer => tlv(0x31, Buffer.concat(parts))
const oid = (encoded: readonly number[]): Buffer => tlv(0x06, Buffer.from(encoded))
const octetString = (content: Buffer): Buffer => tlv(0x04, content)
const bitString = (content: Buffer): Buffer => tlv(0x03, Buffer.concat([Buffer.from([0]), content]))
const utf8String = (text: string): Buffer => tlv(0x0c, Buffer.from(text))

function utcTime(date: Date): Buffer {
  const pad = (value: number): string => String(value).padStart(2, '0')
  const stamp =
    `${pad(date.getUTCFullYear() % 100)}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  return tlv(0x17, Buffer.from(stamp))
}

function distinguishedName(): Buffer {
  return sequence(set(sequence(oid(OID_COMMON_NAME), utf8String(SUBJECT))))
}

function serialNumber(): Buffer {
  const bytes = randomBytes(16)
  bytes[0] = bytes[0]! & 0x7f || 1
  return tlv(0x02, bytes)
}

function subjectAltNames(): Buffer {
  return sequence(
    tlv(0x82, Buffer.from('localhost')),
    tlv(0x87, Buffer.from([127, 0, 0, 1])),
    tlv(0x82, Buffer.from(SUBJECT)),
  )
}

export function createLocalhostCertificate(now = new Date()): TlsMaterial {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  const signatureAlgorithm = sequence(oid(OID_ECDSA_SHA256))
  const notBefore = new Date(now.getTime() - VALIDITY_MS)
  const notAfter = new Date(now.getTime() + VALIDITY_MS)
  const tbs = sequence(
    tlv(0xa0, tlv(0x02, Buffer.from([2]))),
    serialNumber(),
    signatureAlgorithm,
    distinguishedName(),
    sequence(utcTime(notBefore), utcTime(notAfter)),
    distinguishedName(),
    publicKey.export({ type: 'spki', format: 'der' }),
    tlv(0xa3, sequence(extension(oid(OID_SUBJECT_ALT_NAME), octetString(subjectAltNames())))),
  )
  const certificate = new X509Certificate(sequence(tbs, signatureAlgorithm, bitString(sign('sha256', tbs, privateKey))))
  return { key: privateKey.export({ type: 'pkcs8', format: 'pem' }), cert: certificate.toString() }
}

function extension(identifier: Buffer, value: Buffer): Buffer {
  return sequence(identifier, value)
}

export function assertUsableCertificate(material: TlsMaterial): void {
  const certificate = new X509Certificate(material.cert)
  if (!certificate.subjectAltName?.includes('IP Address:127.0.0.1')) {
    throw new Error('the benchmark certificate must name 127.0.0.1 in its subject alternative names')
  }
  if (!certificate.checkPrivateKey(createPrivateKey(material.key))) {
    throw new Error('the benchmark certificate does not match its key')
  }
}
