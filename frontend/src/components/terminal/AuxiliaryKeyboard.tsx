import {
  Terminal,
  ArrowUp,
  FolderOpen,
  ListTree,
  XCircle,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
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

interface KeyCombo {
  id: string
  label: string
  command: string
}

const KEY_COMBOS: KeyCombo[] = [
  { id: 'ctrl-c', label: 'Ctrl+C', command: '\x03' },
  { id: 'ctrl-d', label: 'Ctrl+D', command: '\x04' },
  { id: 'ctrl-z', label: 'Ctrl+Z', command: '\x1a' },
  { id: 'ctrl-l', label: 'Ctrl+L', command: '\x0c' },
  { id: 'esc', label: 'ESC', command: '\x1b' },
  { id: 'tab', label: 'Tab', command: '\t' },
]

interface AuxiliaryKeyboardProps {
  onCommand: (command: string) => void
  onScrollDial: (deltaY: number) => void
  activeModifiers: Set<string>
  onToggleModifier: (modifier: 'ctrl' | 'shift') => void
  onSendModifiedKey?: (key: string) => void
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

  const handleComboClick = (command: string) => {
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
    <div className="w-full border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-2 space-y-2">
      {/* Row 1: Modifier toggles + Key combo presets */}
      <div className="flex flex-wrap gap-1.5">
        {/* Ctrl toggle */}
        <Button
          variant={activeModifiers.has('ctrl') ? 'default' : 'outline'}
          size="sm"
          onClick={() => onToggleModifier('ctrl')}
          className={`min-h-[44px] min-w-[44px] flex items-center justify-center px-3 py-2 touch-manipulation font-mono font-bold ${
            activeModifiers.has('ctrl')
              ? 'bg-primary text-primary-foreground'
              : 'active:bg-gray-100 dark:active:bg-gray-700'
          }`}
        >
          <span className="text-xs">Ctrl</span>
        </Button>
        {/* Shift toggle */}
        <Button
          variant={activeModifiers.has('shift') ? 'default' : 'outline'}
          size="sm"
          onClick={() => onToggleModifier('shift')}
          className={`min-h-[44px] min-w-[44px] flex items-center justify-center px-3 py-2 touch-manipulation font-mono font-bold ${
            activeModifiers.has('shift')
              ? 'bg-primary text-primary-foreground'
              : 'active:bg-gray-100 dark:active:bg-gray-700'
          }`}
        >
          <span className="text-xs">Shift</span>
        </Button>

        {/* Separator */}
        <div className="w-px bg-gray-200 dark:bg-gray-700 my-1" />

        {/* Key combo preset buttons */}
        {KEY_COMBOS.map((combo) => (
          <Button
            key={combo.id}
            variant="outline"
            size="sm"
            onClick={() => handleComboClick(combo.command)}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center px-3 py-2 active:bg-gray-100 dark:active:bg-gray-700 touch-manipulation font-mono"
          >
            <span className="text-xs">{combo.label}</span>
          </Button>
        ))}
      </div>

      {/* Row 2: Shell command presets + Scroll dial */}
      <div className="flex gap-1.5 items-center">
        {presetCommands.map((preset) => {
          const Icon = preset.icon
          return (
            <Button
              key={preset.id}
              variant="outline"
              size="sm"
              onClick={() => handleCommandClick(preset.command)}
              className="min-h-[44px] flex-1 flex flex-col items-center justify-center gap-0.5 px-2 py-1.5 active:bg-gray-100 dark:active:bg-gray-700 touch-manipulation"
            >
              <Icon className="w-3.5 h-3.5" />
              <span className="text-[10px] leading-tight">{preset.label}</span>
            </Button>
          )
        })}

        {/* Scroll Area */}
        <div
          className="min-h-[44px] flex-1 flex flex-col items-center justify-center gap-0.5 px-2 py-1.5 rounded-md border border-input bg-background touch-manipulation select-none cursor-grab active:cursor-grabbing active:bg-accent active:text-accent-foreground"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          aria-label="Scroll area"
        >
          <div className="flex items-center gap-1">
            <ChevronUp className="w-3 h-3 text-muted-foreground" />
            <span className="text-[10px] leading-tight text-muted-foreground">Scroll</span>
            <ChevronDown className="w-3 h-3 text-muted-foreground" />
          </div>
        </div>
      </div>

      {/* Row 3: Arrow keys */}
      <div className="flex gap-1.5 justify-center">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onCommand('\x1b[D')}
          className="min-h-[44px] min-w-[44px] flex items-center justify-center px-3 py-2 active:bg-gray-100 dark:active:bg-gray-700 touch-manipulation"
          aria-label="Arrow Left"
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onCommand('\x1b[B')}
          className="min-h-[44px] min-w-[44px] flex items-center justify-center px-3 py-2 active:bg-gray-100 dark:active:bg-gray-700 touch-manipulation"
          aria-label="Arrow Down"
        >
          <ChevronDown className="w-4 h-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onCommand('\x1b[A')}
          className="min-h-[44px] min-w-[44px] flex items-center justify-center px-3 py-2 active:bg-gray-100 dark:active:bg-gray-700 touch-manipulation"
          aria-label="Arrow Up"
        >
          <ChevronUp className="w-4 h-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onCommand('\x1b[C')}
          className="min-h-[44px] min-w-[44px] flex items-center justify-center px-3 py-2 active:bg-gray-100 dark:active:bg-gray-700 touch-manipulation"
          aria-label="Arrow Right"
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  )
}

export type { PresetCommand, AuxiliaryKeyboardProps }
