import { isPathInside } from '@kobato/server/infra/paths'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('server/infra/paths — isPathInside', () => {
  const root = path.resolve('/data')

  it('returns true for a path nested under root', () => {
    expect(isPathInside(path.resolve(root, 'maxmind', 'GeoLite2-City.mmdb'), root)).toBe(true)
  })

  it('returns true for a path directly under root', () => {
    expect(isPathInside(path.resolve(root, 'file.txt'), root)).toBe(true)
  })

  it('returns false for the root itself', () => {
    expect(isPathInside(root, root)).toBe(false)
  })

  it('returns false for a sibling directory', () => {
    expect(isPathInside(path.resolve('/etc/passwd'), root)).toBe(false)
  })

  it('returns false for a parent traversal', () => {
    expect(isPathInside(path.resolve(root, '..', 'etc', 'passwd'), root)).toBe(false)
  })

  it('returns false for an absolute path on a different root', () => {
    expect(isPathInside(path.resolve('/var/lib/something'), root)).toBe(false)
  })
})
