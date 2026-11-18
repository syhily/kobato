import PlusCardMenuPlugin from '@kobato/inkling-internal/plugins/PlusCardMenuPlugin'
import SlashCardMenuPlugin from '@kobato/inkling-internal/plugins/SlashCardMenuPlugin'

export const CardMenuPlugin = () => {
  return (
    <>
      <PlusCardMenuPlugin />
      <SlashCardMenuPlugin />
    </>
  )
}

export default CardMenuPlugin
