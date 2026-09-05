interface WordCountProps {
  wordCount: number
  tkCount: number
}

const WordCount = ({ wordCount, tkCount }: WordCountProps) => {
  return (
    <div className="absolute top-4 left-6 z-20 block cursor-pointer rounded bg-white px-2 py-1 font-mono text-sm tracking-tight text-grey-600 dark:bg-transparent">
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
