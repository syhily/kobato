export type ClassDictionary = Record<string, any>
export type ClassArray = ClassValue[]
export type ClassValue = ClassArray | ClassDictionary | string | number | bigint | null | boolean | undefined

function toVal(mix: ClassValue): string {
  let str = ''

  if (typeof mix === 'string' || typeof mix === 'number') {
    str += mix
  } else if (typeof mix === 'object') {
    if (Array.isArray(mix)) {
      const len = mix.length
      for (let k = 0; k < len; k++) {
        if (mix[k]) {
          const y = toVal(mix[k])
          if (y) {
            if (str) {
              str += ' '
            }
            str += y
          }
        }
      }
    } else if (mix !== null) {
      for (const key in mix) {
        if (mix[key]) {
          if (str) {
            str += ' '
          }
          str += key
        }
      }
    }
  }

  return str
}

export function clsx(...inputs: ClassValue[]): string {
  let str = ''

  for (let i = 0; i < inputs.length; i++) {
    const tmp = inputs[i]
    if (tmp) {
      const x = toVal(tmp)
      if (x) {
        if (str) {
          str += ' '
        }
        str += x
      }
    }
  }

  return str
}

export default clsx
