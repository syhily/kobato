import { useCallback } from 'react'

// Adapted from lexical-react/src/LexicalTypeaheadMenuPlugin: matching on

export interface TypeaheadTriggerMatchResult {
  leadOffset: number
  matchingString: string
  replaceableString: string
}

interface UseBasicTypeaheadTriggerMatchOptions {
  minLength?: number
  maxLength?: number
}

export default function useBasicTypeaheadTriggerMatch(
  trigger: string,
  { minLength = 1, maxLength = 75 }: UseBasicTypeaheadTriggerMatchOptions = {},
): (text: string) => TypeaheadTriggerMatchResult | null {
  return useCallback(
    (text: string) => {
      const invalidChars = '[^' + trigger + '\\s]'
      const TypeaheadTriggerRegex = new RegExp('[' + trigger + ']((?:' + invalidChars + '){0,' + maxLength + '})$')
      const match = TypeaheadTriggerRegex.exec(text)
      if (match !== null) {
        const matchingString = match[1]
        if (matchingString.length >= minLength) {
          return {
            leadOffset: match.index,
            matchingString,
            replaceableString: match[0],
          }
        }
      }
      return null
    },
    [maxLength, minLength, trigger],
  )
}
