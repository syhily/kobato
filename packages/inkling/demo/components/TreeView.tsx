import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { TreeView } from '@lexical/react/LexicalTreeView'

const TreeViewPlugin = () => {
  const [editor] = useLexicalComposerContext()

  return (
    <TreeView
      editor={editor}
      treeTypeButtonClassName="text-green cursor-pointer font-sans text-md font-medium"
      timeTravelButtonClassName="text-green pb-4 cursor-pointer font-sans text-md font-medium absolute bottom-0"
      timeTravelPanelButtonClassName="text-green font-sans text-md font-medium"
      timeTravelPanelClassName="absolute bottom-1 flex w-[400px]"
      timeTravelPanelSliderClassName="m-3 bg-green flex-grow"
      viewClassName="size-full m-[1rem] p-[1rem] pb-16 overflow-auto text-sm text-grey-300 font-mono selection:bg-grey-800"
    />
  )
}

export default TreeViewPlugin
