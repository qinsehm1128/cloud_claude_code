import { useRef, useEffect, useCallback, KeyboardEvent, ClipboardEvent } from 'react'
import { Send, History } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { generateKeySequence } from '@/utils/keySequence'

export interface CommandInputProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  onSendKeys?: (keys: string) => void
  onHistoryOpen?: () => void
  ctrlActive?: boolean
  altActive?: boolean
  onModifierUsed?: () => void
  disabled?: boolean
  placeholder?: string
  className?: string
}

export function CommandInput({
  value,
  onChange,
  onSubmit,
  onSendKeys,
  onHistoryOpen,
  ctrlActive = false,
  altActive = false,
  onModifierUsed,
  disabled = false,
  placeholder = 'Enter command...',
  className,
}: CommandInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-focus on mount and after submit
  useEffect(() => {
    if (!disabled && textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [disabled])

  // Handle keyboard events
  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Handle Enter key (without Shift for single-line submit)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      onSubmit()
      return
    }

    // Handle modifier key combinations
    if ((ctrlActive || altActive) && e.key.length === 1) {
      e.preventDefault()
      const sequence = generateKeySequence(e.key, ctrlActive, altActive)
      onSendKeys?.(sequence)
      onModifierUsed?.()
      return
    }
  }, [ctrlActive, altActive, onSubmit, onSendKeys, onModifierUsed])

  // Handle paste events
  const handlePaste = useCallback((_e: ClipboardEvent<HTMLTextAreaElement>) => {
    // Allow default paste behavior - the onChange will handle the update
  }, [])

  // Handle input change
  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value)
  }, [onChange])

  return (
    <div className={cn('flex gap-2', className)}>
      {/* History button */}
      {onHistoryOpen && (
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="min-w-[44px] min-h-[44px] shrink-0"
          onClick={onHistoryOpen}
          disabled={disabled}
          title="Command history"
        >
          <History className="h-4 w-4" />
        </Button>
      )}

      {/* Text input area */}
      <div className="flex-1 relative">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          className={cn(
            'w-full min-h-[44px] px-3 py-2 text-sm',
            'bg-background border rounded-md resize-none',
            'focus:outline-none focus:ring-2 focus:ring-ring',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            // Show modifier indicator
            (ctrlActive || altActive) && 'ring-2 ring-primary'
          )}
          style={{
            // Auto-grow height based on content
            height: 'auto',
            minHeight: '44px',
            maxHeight: '120px',
          }}
        />
        {/* Modifier indicator */}
        {(ctrlActive || altActive) && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
            {ctrlActive && (
              <span className="px-1.5 py-0.5 text-xs bg-primary text-primary-foreground rounded">
                Ctrl
              </span>
            )}
            {altActive && (
              <span className="px-1.5 py-0.5 text-xs bg-primary text-primary-foreground rounded">
                Alt
              </span>
            )}
          </div>
        )}
      </div>

      {/* Send button */}
      <Button
        type="button"
        onClick={onSubmit}
        disabled={disabled || !value.trim()}
        className="min-w-[44px] min-h-[44px] shrink-0"
        title="Send command (Enter)"
      >
        <Send className="h-4 w-4" />
      </Button>
    </div>
  )
}

export default CommandInput
