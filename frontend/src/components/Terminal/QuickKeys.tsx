import { useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { QUICK_KEYS, MINIMAL_QUICK_KEYS, QuickKeyDef } from '@/utils/keySequence'

export interface QuickKeysProps {
  onKeyPress: (keys: string) => void
  minimal?: boolean
  disabled?: boolean
  className?: string
}

export function QuickKeys({
  onKeyPress,
  minimal = false,
  disabled = false,
  className,
}: QuickKeysProps) {
  const keys = minimal ? MINIMAL_QUICK_KEYS : QUICK_KEYS

  const handleKeyPress = useCallback((key: QuickKeyDef) => {
    if (!disabled) {
      onKeyPress(key.keys)
    }
  }, [onKeyPress, disabled])

  return (
    <div 
      className={cn(
        'flex flex-wrap gap-1',
        className
      )}
      role="toolbar"
      aria-label="Quick keys"
    >
      {keys.map((key) => (
        <Button
          key={key.label}
          variant="outline"
          size="sm"
          className={cn(
            'min-w-[44px] min-h-[44px] px-2 py-1',
            'text-xs font-mono',
            // Arrow keys are narrower
            key.label.length === 1 && 'min-w-[44px]'
          )}
          onClick={() => handleKeyPress(key)}
          disabled={disabled}
          title={key.description}
          data-key={key.label}
          data-keys={key.keys}
        >
          {key.label}
        </Button>
      ))}
    </div>
  )
}

export default QuickKeys
