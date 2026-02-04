import { useState, useCallback } from 'react'
import { ChevronDown, ChevronUp, FileCode, FileJson } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import type { ConfigType } from '@/types/claudeConfig'
import { ConfigTypes } from '@/types/claudeConfig'

export interface ConfigPreviewProps {
  content: string
  configType: ConfigType
  maxLines?: number // Default 5 lines for truncation
  trigger?: 'hover' | 'click' // Default 'hover'
  className?: string
  children?: React.ReactNode // Trigger element for popover mode
}

// Get syntax type based on config type
const getSyntaxType = (configType: ConfigType): 'markdown' | 'json' => {
  return configType === ConfigTypes.MCP ? 'json' : 'markdown'
}

// Get syntax icon based on config type
const SyntaxIcon = ({ configType }: { configType: ConfigType }) => {
  const syntaxType = getSyntaxType(configType)
  return syntaxType === 'json' ? (
    <FileJson className="h-3 w-3" />
  ) : (
    <FileCode className="h-3 w-3" />
  )
}

// Format JSON content for display
const formatJsonContent = (content: string): string => {
  try {
    const parsed = JSON.parse(content)
    return JSON.stringify(parsed, null, 2)
  } catch {
    return content
  }
}

// Truncate content by lines
const truncateByLines = (content: string, maxLines: number): { truncated: string; isTruncated: boolean } => {
  const lines = content.split('\n')
  if (lines.length <= maxLines) {
    return { truncated: content, isTruncated: false }
  }
  return {
    truncated: lines.slice(0, maxLines).join('\n'),
    isTruncated: true,
  }
}

// Content display component
interface ContentDisplayProps {
  content: string
  configType: ConfigType
  maxLines: number
  expanded: boolean
  onToggleExpand: () => void
  showToggle?: boolean
}

const ContentDisplay = ({
  content,
  configType,
  maxLines,
  expanded,
  onToggleExpand,
  showToggle = true,
}: ContentDisplayProps) => {
  const syntaxType = getSyntaxType(configType)
  const formattedContent = syntaxType === 'json' ? formatJsonContent(content) : content
  const { truncated, isTruncated } = truncateByLines(formattedContent, maxLines)
  
  const displayContent = expanded ? formattedContent : truncated
  const shouldShowToggle = showToggle && isTruncated

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <SyntaxIcon configType={configType} />
        <span data-testid="syntax-type">{syntaxType === 'json' ? 'JSON' : 'Markdown'}</span>
      </div>
      <pre
        className={cn(
          'text-sm font-mono whitespace-pre-wrap break-words rounded-md bg-muted p-3',
          syntaxType === 'json' && 'text-blue-600 dark:text-blue-400'
        )}
        data-testid="preview-content"
        data-syntax={syntaxType}
      >
        {displayContent}
        {!expanded && isTruncated && (
          <span className="text-muted-foreground">...</span>
        )}
      </pre>
      {shouldShowToggle && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggleExpand}
          className="h-auto py-1 px-2 text-xs"
          data-testid="toggle-expand-button"
        >
          {expanded ? (
            <>
              <ChevronUp className="h-3 w-3 mr-1" />
              Show less
            </>
          ) : (
            <>
              <ChevronDown className="h-3 w-3 mr-1" />
              Show more
            </>
          )}
        </Button>
      )}
    </div>
  )
}

// Inline preview component (click trigger)
const InlinePreview = ({
  content,
  configType,
  maxLines,
  className,
}: Omit<ConfigPreviewProps, 'trigger' | 'children'>) => {
  const [expanded, setExpanded] = useState(false)

  const handleToggleExpand = useCallback(() => {
    setExpanded((prev) => !prev)
  }, [])

  return (
    <div className={cn('config-preview-inline', className)} data-testid="config-preview-inline">
      <ContentDisplay
        content={content}
        configType={configType}
        maxLines={maxLines ?? 5}
        expanded={expanded}
        onToggleExpand={handleToggleExpand}
      />
    </div>
  )
}

// Popover preview component (hover trigger)
const PopoverPreview = ({
  content,
  configType,
  maxLines,
  className,
  children,
}: ConfigPreviewProps) => {
  const [expanded, setExpanded] = useState(false)
  const [open, setOpen] = useState(false)

  const handleToggleExpand = useCallback(() => {
    setExpanded((prev) => !prev)
  }, [])

  // Reset expanded state when popover closes
  const handleOpenChange = useCallback((isOpen: boolean) => {
    setOpen(isOpen)
    if (!isOpen) {
      setExpanded(false)
    }
  }, [])

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <span
          className={cn('cursor-pointer', className)}
          data-testid="config-preview-trigger"
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => {
            // Small delay to allow moving to popover content
            setTimeout(() => {
              // Only close if not hovering over popover content
              // This is handled by the Popover component itself
            }, 100)
          }}
        >
          {children}
        </span>
      </PopoverTrigger>
      <PopoverContent
        className="w-96 max-h-80 overflow-y-auto"
        data-testid="config-preview-popover"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
      >
        <ContentDisplay
          content={content}
          configType={configType}
          maxLines={maxLines ?? 5}
          expanded={expanded}
          onToggleExpand={handleToggleExpand}
        />
      </PopoverContent>
    </Popover>
  )
}

// Main ConfigPreview component
export default function ConfigPreview({
  content,
  configType,
  maxLines = 5,
  trigger = 'hover',
  className,
  children,
}: ConfigPreviewProps) {
  if (trigger === 'click') {
    return (
      <InlinePreview
        content={content}
        configType={configType}
        maxLines={maxLines}
        className={className}
      />
    )
  }

  // Hover trigger (popover mode)
  return (
    <PopoverPreview
      content={content}
      configType={configType}
      maxLines={maxLines}
      className={className}
      trigger={trigger}
    >
      {children}
    </PopoverPreview>
  )
}

// Export helper functions for testing
export { truncateByLines, formatJsonContent, getSyntaxType }
