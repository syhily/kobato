import { bytesToSize, sizeToBytes } from '@/nodes/base/utils/size-byte-converter'

describe('Utils: size-byte-converter', function () {
  describe('sizeToBytes', function () {
    it('converts sizes to bytes', function () {
      expect(sizeToBytes('0 Bytes')).toBe(0)
      expect(sizeToBytes('1 Bytes')).toBe(1)
      expect(sizeToBytes('1 KB')).toBe(1024)
      expect(sizeToBytes('1 MB')).toBe(1048576)
      expect(sizeToBytes('1 GB')).toBe(1073741824)
      expect(sizeToBytes('1 TB')).toBe(1099511627776)
    })

    it('rounds to nearest byte', function () {
      expect(sizeToBytes('1.5 KB')).toBe(1536)
    })

    it('returns 0 for empty or unknown input', function () {
      expect(sizeToBytes('')).toBe(0)
      expect(sizeToBytes('10 Unknown')).toBe(0)
    })
  })

  describe('bytesToSize', function () {
    it('converts bytes to human-readable sizes', function () {
      expect(bytesToSize(0)).toBe('0 Byte')
      expect(bytesToSize(1)).toBe('1 Bytes')
      expect(bytesToSize(1024)).toBe('1 KB')
      expect(bytesToSize(1048576)).toBe('1 MB')
      expect(bytesToSize(1073741824)).toBe('1 GB')
    })

    it('rounds to nearest whole unit', function () {
      expect(bytesToSize(1536)).toBe('2 KB')
    })
  })
})
