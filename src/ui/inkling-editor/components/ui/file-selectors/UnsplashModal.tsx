import type { DefaultHeaderTypes, InsertImagePayload } from '@/ui/inkling-editor/unsplash/UnsplashTypes'

import Portal from '@/ui/inkling-editor/components/ui/Portal'
import { UnsplashSearchModal } from '@/ui/inkling-editor/unsplash'

const UnsplashModal = ({
  unsplashConf,
  onImageInsert,
  onClose,
}: {
  unsplashConf?: DefaultHeaderTypes | null
  onImageInsert?: (data: InsertImagePayload) => void
  onClose?: () => void
}) => {
  return (
    <Portal>
      <UnsplashSearchModal
        unsplashProviderConfig={unsplashConf ?? null}
        onClose={onClose!}
        onImageInsert={onImageInsert!}
      />
    </Portal>
  )
}

export default UnsplashModal
