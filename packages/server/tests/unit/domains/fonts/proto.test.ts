import { create, fromBinary, toBinary } from '@bufbuild/protobuf'
import { InputTemplateSchema } from '@kobato/server/domains/fonts/vendor/gen/api_pb'
import { describe, expect, it } from 'vitest'

// Schema-drift guard for the bufbuild-generated `InputTemplate` encoder. The
// generated `gen/api_pb.ts` is the JS↔wasm contract: if the proto schema or
// the `protoc-gen-es` version drifts, the bytes the wasm core receives would
// change and slicing would fail. These tests pin the encoder's wire-format
// output so a regeneration that changes the byte layout is caught loudly
// before the (slower) end-to-end slice test runs.

describe('InputTemplate encoder (bufbuild)', () => {
  it('encodes a minimal input (just bytes) with the field-1 length-delimited tag', () => {
    const source = new Uint8Array([0x00, 0x01, 0x02, 0x03])
    const msg = create(InputTemplateSchema, { input: source })
    const bytes = toBinary(InputTemplateSchema, msg)

    // Field 1, wire type 2 (length-delimited): tag = (1 << 3) | 2 = 0x0a.
    expect(bytes[0]).toBe(0x0a)
    expect(bytes[1]).toBe(source.length)
    expect(bytes.subarray(2, 2 + source.length)).toEqual(source)
  })

  it('encodes chunk_size as field 9 varint (wire type 0, tag = 0x48)', () => {
    const msg = create(InputTemplateSchema, { input: new Uint8Array([0xff]), chunkSize: 1024 })
    const bytes = toBinary(InputTemplateSchema, msg)
    const chunkSizeIdx = bytes.indexOf(0x48)
    expect(chunkSizeIdx).toBeGreaterThan(-1)
    // varint(1024) = 0x80 0x08.
    expect(bytes[chunkSizeIdx + 1]).toBe(0x80)
    expect(bytes[chunkSizeIdx + 2]).toBe(0x08)
  })

  it('encodes css.fontFamily inside a nested message (field 5, tag = 0x2a)', () => {
    const msg = create(InputTemplateSchema, { input: new Uint8Array([0x00]), css: { fontFamily: 'OPPO Sans' } })
    const bytes = toBinary(InputTemplateSchema, msg)
    // Field 5, wire type 2: tag = (5 << 3) | 2 = 0x2a.
    const cssTagIdx = bytes.indexOf(0x2a)
    expect(cssTagIdx).toBeGreaterThan(-1)
    const nestedLen = bytes[cssTagIdx + 1]
    const nested = bytes.subarray(cssTagIdx + 2, cssTagIdx + 2 + nestedLen)
    const expected = new TextEncoder().encode('OPPO Sans')
    expect(Array.from(nested)).toEqual(expect.arrayContaining(Array.from(expected)))
  })

  it('omits unset optional fields (proto3 default elision)', () => {
    const msg = create(InputTemplateSchema, { input: new Uint8Array([0x01]) })
    const bytes = toBinary(InputTemplateSchema, msg)
    expect(bytes.indexOf(0x2a)).toBe(-1) // css tag absent
    expect(bytes.indexOf(0x48)).toBe(-1) // chunk_size tag absent
    expect(bytes.indexOf(0x40)).toBe(-1) // language_areas tag absent
  })

  it('round-trips: toBinary → fromBinary preserves the input bytes', () => {
    const source = new Uint8Array([0xde, 0xad, 0xbe, 0xef])
    const msg = create(InputTemplateSchema, { input: source })
    const bytes = toBinary(InputTemplateSchema, msg)
    const decoded = fromBinary(InputTemplateSchema, bytes)
    expect(Array.from(decoded.input)).toEqual(Array.from(source))
  })
})
