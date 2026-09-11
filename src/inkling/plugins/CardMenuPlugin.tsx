import PlusCardMenuPlugin from '@/inkling/plugins/PlusCardMenuPlugin'
import SlashCardMenuPlugin from '@/inkling/plugins/SlashCardMenuPlugin'

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
