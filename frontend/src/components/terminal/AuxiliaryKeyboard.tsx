import {
  Terminal,
  ArrowUp,
  FolderOpen,
  ListTree,
  XCircle,
  ChevronUp,
  ChevronDown,
  type LucideIcon
} from 'lucide-react'
import { Button } from '@/components/ui/button'

interface PresetCommand {
  id: string
  label: string
  command: string
  icon: LucideIcon
}

const DEFAULT_PRESET_COMMANDS: PresetCommand[] = [
  {
    id: 'cd-parent',
    label: 'cd ..',
    command: 'cd ..\n',
    icon: ArrowUp
  },
  {
    id: 'ls-la',
    label: 'ls -la',
    command: 'ls -la\n',
    icon: ListTree
  },
  {
    id: 'pwd',
    label: 'pwd',
    command: 'pwd\n',
    icon: FolderOpen
  },
  {
    id: 'clear',
    label: 'clear',
    command: 'clear\n',
    icon: Terminal
  },
  {
    id: 'exit',
    label: 'exit',
    command: 'exit\n',
    icon: XCircle
  }
]

interface AuxiliaryKeyboardProps {
  onCommand: (command: string) => void
  onScroll: (direction: 'up' | 'down') => void
  presetCommands?: PresetCommand[]
}

export function AuxiliaryKeyboard({
  onCommand,
  onScroll,
  presetCommands = DEFAULT_PRESET_COMMANDS
}: AuxiliaryKeyboardProps) {
  const handleCommandClick = (command: string) => {
    onCommand(command)
  }

  const handleScrollClick = (direction: 'up' | 'down') => {
    onScroll(direction)
  }

  return (
    <div className="w-full border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-2">
      <div className="grid grid-cols-4 gap-2">
        {presetCommands.map((preset) => {
          const Icon = preset.icon
          return (
            <Button
              key={preset.id}
              variant="outline"
              size="sm"
              onClick={() => handleCommandClick(preset.command)}
              className="min-h-[44px] flex flex-col items-center justify-center gap-1 px-2 py-2 active:bg-gray-100 dark:active:bg-gray-700 touch-manipulation"
            >
              <Icon className="w-4 h-4" />
              <span className="text-xs">{preset.label}</span>
            </Button>
          )
        })}

        <Button
          variant="outline"
          size="sm"
          onClick={() => handleScrollClick('up')}
          className="min-h-[44px] flex flex-col items-center justify-center gap-1 px-2 py-2 active:bg-gray-100 dark:active:bg-gray-700 touch-manipulation"
          aria-label="Scroll up"
        >
          <ChevronUp className="w-4 h-4" />
          <span className="text-xs">Up</span>
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={() => handleScrollClick('down')}
          className="min-h-[44px] flex flex-col items-center justify-center gap-1 px-2 py-2 active:bg-gray-100 dark:active:bg-gray-700 touch-manipulation"
          aria-label="Scroll down"
        >
          <ChevronDown className="w-4 h-4" />
          <span className="text-xs">Down</span>
        </Button>
      </div>
    </div>
  )
}

export type { PresetCommand, AuxiliaryKeyboardProps }
