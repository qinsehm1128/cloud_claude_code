import { useState, useCallback, useEffect } from 'react'
import { ChevronUp, ChevronDown, Keyboard } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { CommandInput } from './CommandInput'
import { QuickKeys } from './QuickKeys'
import { CommandHistory } from './CommandHistory'
import { useCommandHistory } from '@/hooks/useCommandHistory'
import { generateKeySequence } from '@/utils/keySequence'

export interface MobileKeyboardProps {
  onSendCommand: (command: string) => void
  onSendKeys: (keys: string) => void
  visible: boolean
  onVisibilityChange: (visible: boolean) => void
  connected?: boolean
}

interface MobileKeyboardState {
  collapsed: boolean
  ctrlActive: boolean
  altActive: boolean
  historyOpen: boolean
  inputValue: string
}

const STORAGE_KEY = 'mobile_keyboard_state'

export function MobileKeyboard({
  onSendCommand,
  onSendKeys,
  visible,
  onVisibilityChange,
  connected = true,
}: MobileKeyboardProps) {
  const [state, setState] = useState<MobileKeyboardState>({
    collapsed: false,
    ctrlActive: false,
    altActive: false,
    historyOpen: false,
    inputValue: '',
  })

  const { history, addCommand, clearHistory, removeCommand } = useCommandHistory()

  // Load collapsed state from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        setState(prev => ({
          ...prev,
          collapsed: parsed.collapsed ?? false,
        }))
      }
    } catch {
      // Ignore parse errors, use default state
    }
  }, [])

  // Save collapsed state to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        collapsed: state.collapsed,
      }))
    } catch {
      // Ignore storage errors
    }
  }, [state.collapsed])

  const toggleCollapsed = useCallback(() => {
    setState(prev => ({ ...prev, collapsed: !prev.collapsed }))
  }, [])

  const setCtrlActive = useCallback((active: boolean) => {
    setState(prev => ({ ...prev, ctrlActive: active }))
  }, [])

  const setAltActive = useCallback((active: boolean) => {
    setState(prev => ({ ...prev, altActive: active }))
  }, [])

  const setInputValue = useCallback((value: string) => {
    setState(prev => ({ ...prev, inputValue: value }))
  }, [])

  const setHistoryOpen = useCallback((open: boolean) => {
    setState(prev => ({ ...prev, historyOpen: open }))
  }, [])

  // Clear modifiers after use
  const clearModifiers = useCallback(() => {
    setState(prev => ({ ...prev, ctrlActive: false, altActive: false }))
  }, [])

  // Handle sending a command
  const handleSendCommand = useCallback(() => {
    const trimmed = state.inputValue.trim()
    if (trimmed) {
      // Add newline to execute the command
      onSendCommand(trimmed + '\r')
      addCommand(trimmed)
      setState(prev => ({ ...prev, inputValue: '' }))
    }
  }, [state.inputValue, onSendCommand, addCommand])

  // Handle sending key sequences (from quick keys or modifier combos)
  const handleSendKeys = useCallback((keys: string) => {
    onSendKeys(keys)
  }, [onSendKeys])

  // Handle modifier key combination from input
  const handleModifierKeyPress = useCallback((keys: string) => {
    onSendKeys(keys)
    clearModifiers()
  }, [onSendKeys, clearModifiers])

  // Handle selecting a command from history
  const handleHistorySelect = useCallback((command: string) => {
    setState(prev => ({ ...prev, inputValue: command, historyOpen: false }))
  }, [])

  if (!visible) {
    return null
  }

  return (
    <div
      className={cn(
        'border-t bg-card transition-all duration-200',
        'max-h-[40vh] portrait:max-h-[40vh] landscape:max-h-[50vh]',
        state.collapsed ? 'h-auto' : 'h-auto'
      )}
    >
      {/* Collapse/Expand Header */}
      <div className="flex items-center justify-between px-2 py-1 border-b bg-muted/50">
        <div className="flex items-center gap-1">
          <Keyboard className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Virtual Keyboard</span>
          {!connected && (
            <span className="text-xs text-destructive">(Disconnected)</span>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={toggleCollapsed}
          title={state.collapsed ? 'Expand keyboard' : 'Collapse keyboard'}
        >
          {state.collapsed ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Collapsed: Show minimal quick keys */}
      {state.collapsed && (
        <div className="px-2 py-1">
          <QuickKeys
            onKeyPress={handleSendKeys}
            minimal={true}
            disabled={!connected}
          />
        </div>
      )}

      {/* Expanded: Show full keyboard */}
      {!state.collapsed && (
        <div className="flex flex-col gap-2 p-2">
          {/* Quick Keys area */}
          <QuickKeys
            onKeyPress={handleSendKeys}
            disabled={!connected}
          />

          {/* Command Input area with history */}
          <div className="relative">
            {/* History popup */}
            {state.historyOpen && (
              <CommandHistory
                history={history}
                onSelect={handleHistorySelect}
                onRemove={removeCommand}
                onClear={clearHistory}
                onClose={() => setHistoryOpen(false)}
              />
            )}

            <CommandInput
              value={state.inputValue}
              onChange={setInputValue}
              onSubmit={handleSendCommand}
              onSendKeys={handleModifierKeyPress}
              onHistoryOpen={() => setHistoryOpen(true)}
              ctrlActive={state.ctrlActive}
              altActive={state.altActive}
              onModifierUsed={clearModifiers}
              disabled={!connected}
            />
          </div>

          {/* Modifier Keys */}
          <div className="flex items-center gap-2">
            <Button
              variant={state.ctrlActive ? 'default' : 'outline'}
              size="sm"
              className={cn(
                'min-w-[44px] min-h-[44px]',
                state.ctrlActive && 'ring-2 ring-primary ring-offset-2'
              )}
              onClick={() => setCtrlActive(!state.ctrlActive)}
              disabled={!connected}
              title="Toggle Ctrl modifier"
            >
              Ctrl
            </Button>
            <Button
              variant={state.altActive ? 'default' : 'outline'}
              size="sm"
              className={cn(
                'min-w-[44px] min-h-[44px]',
                state.altActive && 'ring-2 ring-primary ring-offset-2'
              )}
              onClick={() => setAltActive(!state.altActive)}
              disabled={!connected}
              title="Toggle Alt modifier"
            >
              Alt
            </Button>
            <span className="text-xs text-muted-foreground ml-2">
              {(state.ctrlActive || state.altActive) 
                ? 'Type a key to send combination'
                : 'Click to activate modifier'}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

export default MobileKeyboard
