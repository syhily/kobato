interface FloatingButtonProps {
  isOpen: boolean
  onClick: (view: 'json' | 'tree') => void
}

const FloatingButton = ({ isOpen, onClick }: FloatingButtonProps) => {
  return (
    <div
      className={`fixed right-6 bottom-4 z-20 rounded px-2 py-1 font-mono text-sm tracking-tight text-grey-600 transition-all duration-200 ease-in-out ${isOpen ? 'bg-transparent' : 'bg-white'}`}
    >
      <button className="cursor-pointer" type="button" onClick={() => onClick('json')}>
        JSON output
      </button>
      &nbsp;|&nbsp;
      <button className="cursor-pointer" type="button" onClick={() => onClick('tree')}>
        State tree
      </button>
    </div>
  )
}

export default FloatingButton
