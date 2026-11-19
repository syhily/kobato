import React from 'react'

export interface UseInitialFileUploadOptions {
  initialFile: File | null | undefined
  isReady: boolean
  run: (file: File) => unknown
}

export function useInitialFileUpload({ initialFile, isReady, run }: UseInitialFileUploadOptions): void {
  React.useEffect(() => {
    if (initialFile && isReady) {
      run(initialFile)
    }
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
