interface WordCountProps {
  wordCount: number
  selectionWordCount: number | null
  tkCount: number
}

const WordCount = ({ wordCount, selectionWordCount, tkCount }: WordCountProps) => {
  return (
    <div className="text-grey-600 absolute top-4 left-6 z-20 block cursor-pointer rounded bg-white px-2 py-1 font-mono text-sm tracking-tight dark:bg-transparent">
      {selectionWordCount !== null && (
        <>
          <span data-testid="selection-word-count">{selectionWordCount}</span>
          {' of '}
        </>
      )}
      <span data-testid="word-count">{wordCount}</span> words
      {tkCount > 0 && (
        <>
          {' '}
          / <span data-testid="tk-count">{tkCount}</span> TK{tkCount > 1 && 's'}
        </>
      )}
    </div>
  )
}

export default WordCount
