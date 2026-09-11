import { useInklingLabels } from '@/inkling/hooks/useInklingLabels'
import { ERROR_TYPE } from '@/inkling/utils/services/gif'

export function Error({ error }: { error?: string }) {
  const labels = useInklingLabels()

  if (error === ERROR_TYPE.COMMON) {
    return <p>{labels['gif.error.common']}</p>
  }

  if (error === ERROR_TYPE.INVALID_API_KEY) {
    return <p>{labels['gif.error.invalidApiKey']}</p>
  }
  return <p>{error}</p>
}
