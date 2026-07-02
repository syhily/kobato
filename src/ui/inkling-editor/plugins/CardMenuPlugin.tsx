import PlusCardMenuPlugin from '@/ui/inkling-editor/plugins/PlusCardMenuPlugin'
import SlashCardMenuPlugin from '@/ui/inkling-editor/plugins/SlashCardMenuPlugin'

export const CardMenuPlugin = () => {
  return (
    <>
      {/* Inkling Plugins */}
      <PlusCardMenuPlugin />
      <SlashCardMenuPlugin />
    </>
  )
}

export default CardMenuPlugin
