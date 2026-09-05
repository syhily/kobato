import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { dataSrcToFile } from '@/utils/dataSrcToFile'

describe('dataSrcToFile', () => {
  const originalCrypto = globalThis.crypto

  beforeEach(() => {
    Object.defineProperty(globalThis, 'crypto', {
      value: {
        randomUUID: () => 'test-uuid',
      },
      configurable: true,
    })
  })

  afterEach(() => {
    Object.defineProperty(globalThis, 'crypto', {
      value: originalCrypto,
      configurable: true,
    })
    vi.restoreAllMocks()
  })

  it('returns undefined for non-data urls', async () => {
    await expect(dataSrcToFile('https://example.com/image.png')).resolves.toBeUndefined()
  })

  it('converts a data url into a File with a generated name', async () => {
    const file = await dataSrcToFile('data:image/png;base64,iVBORw0KGgo=')

    expect(file).toBeInstanceOf(File)
    expect(file!.name).toBe('data-src-image-test-uuid.png')
    expect(file!.type).toBe('image/png')
  })

  it('uses the provided file name when given', async () => {
    const file = await dataSrcToFile(
      'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
      'custom.gif',
    )

    expect(file).toBeInstanceOf(File)
    expect(file!.name).toBe('custom.gif')
    expect(file!.type).toBe('image/gif')
  })

  it('falls back to getRandomValues when randomUUID is unavailable', async () => {
    Object.defineProperty(globalThis, 'crypto', {
      value: {
        randomUUID: () => {
          throw new Error('not supported')
        },
        getRandomValues: (array: Uint8Array) => {
          array.fill(0xab)
          return array
        },
      },
      configurable: true,
    })

    const file = await dataSrcToFile('data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD')

    expect(file).toBeInstanceOf(File)
    expect(file!.name).toBe('data-src-image-abababababababab.jpeg')
  })
})
