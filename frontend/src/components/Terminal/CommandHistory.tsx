import { useCallback } from 'react'
import { X, Trash2, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

export interface CommandHistoryProps {
  history: string[]
  onSelect: (command: string) => void
  onRemove?: (index: number) => void
  onClear?: () => void
  onClose: () => void
  className?: string
}

export function CommandHistory({
  history,
  onSelect,
  onRemove,
  onClear,
  onClose,
  className,
}: CommandHistoryProps) {
  const handleSelect = useCallback((command: string) => {
    onSelect(command)
    onClose()
  }, [onSelect, onClose])

  return (
    <div 
      className={cn(
        'absolute bottom-full left-0 right-0 mb-2',
        'bg-card border rounded-lg shadow-lg',
        'max-h-[200px] flex flex-col',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Command History</span>
          <span className="text-xs text-muted-foreground">
            ({history.length})
          </span>
        </div>
        <div className="flex items-center gap-1">
          {onClear && history.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={onClear}
              title="Clear history"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={onClose}
            title="Close"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* History List */}
      <ScrollArea className="flex-1">
        {history.length === 0 ? (
          <div className="px-3 py-4 text-center text-sm text-muted-foreground">
            No command history
          </div>
        ) : (
          <div className="py-1">
            {/* Show most recent first */}
            {[...history].reverse().map((command, reversedIndex) => {
              const originalIndex = history.length - 1 - reversedIndex
              return (
                <div
                  key={`${originalIndex}-${command}`}
                  className={cn(
                    'flex items-center gap-2 px-3 py-1.5',
                    'hover:bg-muted cursor-pointer group'
                  )}
                  onClick={() => handleSelect(command)}
                >
                  <span 
                    className="flex-1 text-sm font-mono truncate"
                    title={command}
                  >
                    {command}
                  </span>
                  {onRemove && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
                      onClick={(e) => {
                        e.stopPropagation()
                        onRemove(originalIndex)
                      }}
                      title="Remove"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}

export default CommandHistory
