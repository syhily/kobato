import { useCallback } from 'react'

// adapted from lexical-react/src/LexicalTypeaheadMenuPlugin
//  we need the ability to match on punctuation, as well as a leading space, which was not possible using lexical's version

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
      const invalidChars = '[^' + trigger + '\\s]' // escaped set - these cannot be present in the matched string
      const TypeaheadTriggerRegex = new RegExp(
        '[' + trigger + ']' + '(' + '(?:' + invalidChars + ')' + '{0,' + maxLength + '}' + ')$',
      )
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
