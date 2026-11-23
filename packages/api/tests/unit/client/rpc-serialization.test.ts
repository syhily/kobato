import {
  decodeKobatoRpcResponse,
  serializeKobatoRpcInput,
  serializeKobatoRpcQueryInput,
} from '@kobato/api/client/rpc-serialization'
import { ORPCError } from '@orpc/client'
import { describe, expect, it } from 'vitest'

describe('oRPC transport serialization helpers', () => {
  it('serializes File inputs as standard multipart RPC bodies and decodes outputs', () => {
    const body = serializeKobatoRpcInput({ file: new File(['abc'], 'a.txt'), slot: 'icon' })
    expect(body).toBeInstanceOf(FormData)
    const form = body as FormData
    expect(form.get('0')).toBeInstanceOf(File)
    const data = JSON.parse(String(form.get('data'))) as { maps: unknown[] }
    expect(data.maps).toBeDefined()
    expect(decodeKobatoRpcResponse({ json: { accepted: true } }, 200)).toEqual({ accepted: true })
  })

  it('uses the standard data query envelope for GET media URLs', () => {
    const data = JSON.parse(serializeKobatoRpcQueryInput({ source: 'netease', sourceId: '1' })) as {
      json: unknown
    }
    expect(data.json).toEqual({ source: 'netease', sourceId: '1' })
  })

  it('decodes wire errors into ORPCError rejections', () => {
    const wire = new ORPCError('BAD_REQUEST', { message: 'invalid', data: { descriptor: { messageKey: 'x' } } })
    expect(() => decodeKobatoRpcResponse({ json: wire.toJSON() }, 400)).toThrow(ORPCError)
  })

  it('preserves localized errors from the HTTP body-limit perimeter', () => {
    const payload = {
      error: {
        code: 'PAYLOAD_TOO_LARGE',
        message: '上传文件过大',
        descriptor: { messageKey: 'common.error.uploadTooLarge', fallbackMessage: 'too large' },
      },
    }
    expect(() => decodeKobatoRpcResponse(payload, 413)).toThrow(
      expect.objectContaining({
        code: 'PAYLOAD_TOO_LARGE',
        message: '上传文件过大',
        data: { descriptor: payload.error.descriptor },
      }),
    )
  })
})
