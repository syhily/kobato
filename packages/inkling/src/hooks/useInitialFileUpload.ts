import { useEffect, useEffectEvent } from 'react'
export interface UseInitialFileUploadOptions {
  initialFile: File | null | undefined
  isReady: boolean
  run: (file: File) => unknown
}

export function useInitialFileUpload({ initialFile, isReady, run }: UseInitialFileUploadOptions): void {
  const runInitialUpload = useEffectEvent(() => {
    if (initialFile && isReady) {
      run(initialFile)
    }
  })

  useEffect(() => {
    runInitialUpload()
  }, [])
}
