import { assertUsableCertificate, createLocalhostCertificate } from '@kobato/font-split/scripts/bench/tls-certificate'
import { createPrivateKey, X509Certificate } from 'node:crypto'
import { createSecureContext } from 'node:tls'
import { describe, expect, it } from 'vitest'

describe('bench tls certificate', () => {
  it('issues a self-signed certificate that names localhost and 127.0.0.1', () => {
    const material = createLocalhostCertificate(new Date('2026-11-27T00:00:00Z'))
    const certificate = new X509Certificate(material.cert)
    expect(certificate.subjectAltName).toContain('IP Address:127.0.0.1')
    expect(certificate.subjectAltName).toContain('DNS:localhost')
    expect(certificate.validFrom).toBe('Nov 26 00:00:00 2026 GMT')
    expect(certificate.validTo).toBe('Nov 28 00:00:00 2026 GMT')
    expect(certificate.checkPrivateKey(createPrivateKey(material.key))).toBe(true)
    expect(() => createSecureContext(material)).not.toThrow()
    expect(() => assertUsableCertificate(material)).not.toThrow()
  })

  it('issues a distinct serial on every call', () => {
    const first = new X509Certificate(createLocalhostCertificate().cert)
    const second = new X509Certificate(createLocalhostCertificate().cert)
    expect(first.serialNumber).not.toBe(second.serialNumber)
  })

  it('rejects material that does not match', () => {
    const material = createLocalhostCertificate()
    const other = createLocalhostCertificate()
    expect(() => assertUsableCertificate({ key: other.key, cert: material.cert })).toThrow(/does not match/)
  })
})
