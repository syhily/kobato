function trimStartSlash(value: string): string {
  let i = 0
  while (i < value.length && value.charCodeAt(i) === 47) {
    i++
  }
  return i === 0 ? value : value.slice(i)
}

function trimEndSlash(value: string): string {
  let i = value.length
  while (i > 0 && value.charCodeAt(i - 1) === 47) {
    i--
  }
  return i === value.length ? value : value.slice(0, i)
}

export function joinUrl(...parts: string[]): string {
  let result = ''
  let started = false
  for (const part of parts) {
    if (part === '') {
      continue
    }
    if (!started) {
      result = part
      started = true
      continue
    }
    result = `${trimEndSlash(result)}/${trimStartSlash(part)}`
  }
  return result
}

export function withLeadingSlash(value: string): string {
  return value.startsWith('/') ? value : `/${value}`
}
