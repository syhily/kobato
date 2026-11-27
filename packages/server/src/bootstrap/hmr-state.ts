import { isRecord } from '@kobato/utils/type-guards'

export function readHmrFlag(key: string): boolean {
  const data: unknown = import.meta.hot?.data
  return isRecord(data) && data[key] === true
}

export function writeHmrFlag(key: string, value: boolean): void {
  const data: unknown = import.meta.hot?.data
  if (isRecord(data)) {
    data[key] = value
  }
}
