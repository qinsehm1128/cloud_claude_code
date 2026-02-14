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
import { useRef } from 'react'
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
  onScrollDial: (deltaY: number) => void
  activeModifiers: Set<string>
  onToggleModifier: (modifier: 'ctrl' | 'shift') => void
  presetCommands?: PresetCommand[]
}

export function AuxiliaryKeyboard({
  onCommand,
  onScrollDial,
  activeModifiers,
  onToggleModifier,
  presetCommands = DEFAULT_PRESET_COMMANDS
}: AuxiliaryKeyboardProps) {
  const touchStartRef = useRef<number>(0)

  const handleCommandClick = (command: string) => {
    onCommand(command)
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartRef.current = e.touches[0].clientY
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    const currentY = e.touches[0].clientY
    const deltaY = touchStartRef.current - currentY
    onScrollDial(deltaY)
    touchStartRef.current = currentY
  }

  return (
    <div className="w-full border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-2">
      <div className="grid grid-cols-4 gap-2">
        {/* Modifier keys */}
        <Button
          variant={activeModifiers.has('ctrl') ? 'default' : 'outline'}
          size="sm"
          onClick={() => onToggleModifier('ctrl')}
          className={`min-h-[44px] flex flex-col items-center justify-center gap-1 px-2 py-2 touch-manipulation font-mono font-bold ${
            activeModifiers.has('ctrl')
              ? 'bg-primary text-primary-foreground'
              : 'active:bg-gray-100 dark:active:bg-gray-700'
          }`}
        >
          <span className="text-xs">Ctrl</span>
        </Button>
        <Button
          variant={activeModifiers.has('shift') ? 'default' : 'outline'}
          size="sm"
          onClick={() => onToggleModifier('shift')}
          className={`min-h-[44px] flex flex-col items-center justify-center gap-1 px-2 py-2 touch-manipulation font-mono font-bold ${
            activeModifiers.has('shift')
              ? 'bg-primary text-primary-foreground'
              : 'active:bg-gray-100 dark:active:bg-gray-700'
          }`}
        >
          <span className="text-xs">Shift</span>
        </Button>

        {/* Preset commands */}
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

        {/* Scroll Dial */}
        <div
          className="w-16 h-16 rounded-full border-2 border-gray-300 dark:border-gray-600 bg-muted flex flex-col items-center justify-center touch-manipulation select-none cursor-grab active:cursor-grabbing active:border-primary"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          aria-label="Scroll dial"
        >
          <ChevronUp className="w-3 h-3 text-muted-foreground" />
          <span className="text-[10px] text-muted-foreground leading-tight">Scroll</span>
          <ChevronDown className="w-3 h-3 text-muted-foreground" />
        </div>
      </div>
    </div>
  )
}

export type { PresetCommand, AuxiliaryKeyboardProps }
