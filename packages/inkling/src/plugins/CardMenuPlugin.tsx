import PlusCardMenuPlugin from '@/plugins/PlusCardMenuPlugin'
import SlashCardMenuPlugin from '@/plugins/SlashCardMenuPlugin'

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
