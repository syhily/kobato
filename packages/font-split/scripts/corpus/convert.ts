import { tableDir } from '@kobato/font-split/scripts/corpus/profile'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ConverterFactory } from 'opencc-js/core'

export interface Converter {
  convert(text: string): string
}

export interface Opencc {
  hans: Converter
  hant: Converter
}

const openccDir = join(tableDir, 'opencc')

function readPairs(file: string): Array<[string, string]> {
  const pairs: Array<[string, string]> = []
  const lines = readFileSync(join(openccDir, file), 'utf8').split('\n')
  lines.forEach((raw, index) => {
    const line = (index === 0 ? raw.replace(/^\uFEFF/, '') : raw).replace(/\p{White_Space}+$/u, '')
    if (line === '' || line.startsWith('#')) {
      return
    }
    const tab = line.indexOf('\t')
    if (tab === -1) {
      throw new Error(`${file}:${index + 1}: missing TAB separator`)
    }
    pairs.push([line.slice(0, tab), /\S+/u.exec(line.slice(tab + 1))?.[0] ?? ''])
  })
  return pairs
}

const IDS_OPERATOR = /([\u2ff0-\u2fff])/u

function converter(phraseFile: string, characterFile: string): Converter {
  const convert = ConverterFactory([[readPairs(phraseFile), readPairs(characterFile)]])
  return {
    convert(text: string): string {
      return text
        .split(IDS_OPERATOR)
        .map((part, index) => (index % 2 === 1 ? part : convert(part)))
        .join('')
    },
  }
}

let cached: Opencc | null = null

export function opencc(): Opencc {
  cached ??= {
    hans: converter('TSPhrases.txt', 'TSCharacters.txt'),
    hant: converter('STPhrases.txt', 'STCharacters.txt'),
  }
  return cached
}
