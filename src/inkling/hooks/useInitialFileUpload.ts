import React from 'react'

export interface UseInitialFileUploadOptions {
  initialFile: File | null | undefined
  /**
   * The card's own kickoff guard, preserved per card as data (image `!src`,
   * audio `!src && !isLoading`, video `!isLoading`, file `!fileSrc`) — not a
   * unified policy.
   */
  isReady: boolean
  run: (file: File) => unknown
}

/**
 * The one initial-file kickoff effect: fires once on mount when an `initialFile`
 * was handed to the card and the card's guard allows it.
 */
export function useInitialFileUpload({ initialFile, isReady, run }: UseInitialFileUploadOptions): void {
  React.useEffect(() => {
    if (initialFile && isReady) {
      run(initialFile)
    }

    // init-only kickoff — mount-only deps are deliberate
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
