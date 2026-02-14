import { useState } from 'react'
import { ChevronDown, ChevronRight, Copy, Check, Loader2, Sparkles, FileEdit } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface CLIWorkflowPanelProps {
  geminiOutput: string | null
  codexOutput: string | null
  isLoading: boolean
  onClose: () => void
}

export function CLIWorkflowPanel({
  geminiOutput,
  codexOutput,
  isLoading,
  onClose,
}: CLIWorkflowPanelProps) {
  const [geminiExpanded, setGeminiExpanded] = useState(true)
  const [codexExpanded, setCodexExpanded] = useState(true)
  const [copiedSection, setCopiedSection] = useState<string | null>(null)

  const hasContent = geminiOutput || codexOutput || isLoading
  if (!hasContent) return null

  const handleCopy = async (text: string, section: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedSection(section)
      setTimeout(() => setCopiedSection(null), 2000)
    } catch {
      // Clipboard API may not be available
    }
  }

  return (
    <div className="border-t bg-card/50 max-h-[300px] overflow-y-auto">
      <div className="flex items-center justify-between px-3 py-1.5 border-b bg-card">
        <span className="text-xs font-medium text-muted-foreground">CLI Workflow Results</span>
        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={onClose}>
          Close
        </Button>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Processing workflow... This may take several minutes.
        </div>
      )}

      {geminiOutput && (
        <div className="border-b">
          <button
            className="flex items-center gap-2 w-full px-3 py-2 text-sm font-medium hover:bg-accent/50 transition-colors"
            onClick={() => setGeminiExpanded(!geminiExpanded)}
          >
            {geminiExpanded ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
            <Sparkles className="h-3.5 w-3.5 text-yellow-500" />
            Analysis Results
            <Button
              variant="ghost"
              size="sm"
              className="h-5 px-1.5 ml-auto"
              onClick={(e) => {
                e.stopPropagation()
                handleCopy(geminiOutput, 'gemini')
              }}
            >
              {copiedSection === 'gemini' ? (
                <Check className="h-3 w-3 text-green-500" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
            </Button>
          </button>
          {geminiExpanded && (
            <pre className="px-3 pb-3 text-xs whitespace-pre-wrap break-words font-mono text-muted-foreground max-h-[200px] overflow-y-auto">
              {geminiOutput}
            </pre>
          )}
        </div>
      )}

      {codexOutput && (
        <div className="border-b">
          <button
            className="flex items-center gap-2 w-full px-3 py-2 text-sm font-medium hover:bg-accent/50 transition-colors"
            onClick={() => setCodexExpanded(!codexExpanded)}
          >
            {codexExpanded ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
            <FileEdit className="h-3.5 w-3.5 text-blue-500" />
            Modifications
            <Button
              variant="ghost"
              size="sm"
              className="h-5 px-1.5 ml-auto"
              onClick={(e) => {
                e.stopPropagation()
                handleCopy(codexOutput, 'codex')
              }}
            >
              {copiedSection === 'codex' ? (
                <Check className="h-3 w-3 text-green-500" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
            </Button>
          </button>
          {codexExpanded && (
            <pre className="px-3 pb-3 text-xs whitespace-pre-wrap break-words font-mono text-muted-foreground max-h-[200px] overflow-y-auto">
              {codexOutput}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}
