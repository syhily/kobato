interface DarkModeToggleProps {
  darkMode: boolean
  toggleDarkMode: () => void
}

const DarkModeToggle = ({ darkMode, toggleDarkMode }: DarkModeToggleProps) => {
  return (
    <>
      <button
        className="absolute top-4 right-20 z-20 block h-[22px] w-[42px] cursor-pointer rounded-full transition-all ease-in-out"
        type="button"
        onClick={toggleDarkMode}
      >
        {darkMode ? '🌚' : '🌞'}
      </button>
    </>
  )
}

export default DarkModeToggle
