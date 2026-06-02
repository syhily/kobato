function shuffleInPlace<T>(array: T[]): T[] {
  let currentIndex = array.length
  let randomIndex: number

  while (currentIndex !== 0) {
    randomIndex = Math.floor(Math.random() * currentIndex)
    currentIndex--
    ;[array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]]
  }

  return array
}

export function shuffle<T>(array: readonly T[]): T[] {
  return shuffleInPlace(array.slice())
}
