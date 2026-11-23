import { createORPCErrorFromJson, isORPCErrorJson, isORPCErrorStatus, ORPCError } from '@orpc/client'
import { StandardRPCJsonSerializer, StandardRPCSerializer } from '@orpc/client/standard'

function serializer(): StandardRPCSerializer {
  return new StandardRPCSerializer(new StandardRPCJsonSerializer())
}

export function serializeKobatoRpcInput(input: unknown): object {
  return serializer().serialize(input)
}

export function serializeKobatoRpcQueryInput(input: unknown): string {
  return JSON.stringify(serializeKobatoRpcInput(input))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function perimeterError(decoded: unknown, status: number): ORPCError<string, unknown> | null {
  if (!isRecord(decoded) || !isRecord(decoded.error)) {
    return null
  }
  const error = decoded.error
  if (typeof error.code !== 'string' || typeof error.message !== 'string') {
    return null
  }
  const descriptor = error.descriptor
  const issues = error.issues
  return createORPCErrorFromJson({
    defined: false,
    code: error.code,
    status,
    message: error.message,
    data: {
      ...(isRecord(descriptor) ? { descriptor } : {}),
      ...(Array.isArray(issues) ? { issues } : {}),
    },
  })
}

export function decodeKobatoRpcResponse(payload: unknown, status: number): unknown {
  if (isORPCErrorStatus(status)) {
    const perimeter = perimeterError(payload, status)
    if (perimeter !== null) {
      throw perimeter
    }
  }
  const decoded = serializer().deserialize(payload)
  if (!isORPCErrorStatus(status)) {
    return decoded
  }
  if (isORPCErrorJson(decoded)) {
    throw createORPCErrorFromJson(decoded)
  }
  throw new ORPCError('MALFORMED_ORPC_ERROR_RESPONSE', { status, data: decoded })
}
