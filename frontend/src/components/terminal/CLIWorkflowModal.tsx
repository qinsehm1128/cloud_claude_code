import { useState } from 'react'
import { Sparkles, Wand2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export interface WorkflowConfig {
  analysisPrompt: string
  modificationPrompt?: string
  workdir: string
}

interface CLIWorkflowModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (config: WorkflowConfig) => void
  workflowType: 'sequential' | 'analyze'
  defaultWorkdir: string
}

export function CLIWorkflowModal({
  isOpen,
  onClose,
  onSubmit,
  workflowType,
  defaultWorkdir,
}: CLIWorkflowModalProps) {
  const [analysisPrompt, setAnalysisPrompt] = useState('')
  const [modificationPrompt, setModificationPrompt] = useState('')
  const [workdir, setWorkdir] = useState(defaultWorkdir || '/app')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const isSequential = workflowType === 'sequential'
  const Icon = isSequential ? Wand2 : Sparkles

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}
    if (!analysisPrompt.trim() || analysisPrompt.trim().length < 10) {
      newErrors.analysisPrompt = 'Analysis prompt must be at least 10 characters'
    }
    if (isSequential && (!modificationPrompt.trim() || modificationPrompt.trim().length < 10)) {
      newErrors.modificationPrompt = 'Modification prompt must be at least 10 characters'
    }
    if (!workdir.trim()) {
      newErrors.workdir = 'Working directory is required'
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    onSubmit({
      analysisPrompt: analysisPrompt.trim(),
      modificationPrompt: isSequential ? modificationPrompt.trim() : undefined,
      workdir: workdir.trim(),
    })
    setAnalysisPrompt('')
    setModificationPrompt('')
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className="h-5 w-5" />
            {isSequential ? 'Auto-fix Issues' : 'Analyze Code'}
          </DialogTitle>
          <DialogDescription>
            {isSequential
              ? 'Run Gemini analysis followed by Codex code modifications.'
              : 'Run Gemini analysis on the project code.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Analysis Prompt</label>
            <textarea
              className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y"
              placeholder="Describe what to analyze... (e.g., Find all security vulnerabilities in the auth module)"
              value={analysisPrompt}
              onChange={(e) => setAnalysisPrompt(e.target.value)}
            />
            {errors.analysisPrompt && (
              <p className="text-xs text-destructive">{errors.analysisPrompt}</p>
            )}
          </div>

          {isSequential && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Modification Prompt</label>
              <textarea
                className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y"
                placeholder="Describe what modifications to make based on analysis results..."
                value={modificationPrompt}
                onChange={(e) => setModificationPrompt(e.target.value)}
              />
              {errors.modificationPrompt && (
                <p className="text-xs text-destructive">{errors.modificationPrompt}</p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium">Working Directory</label>
            <input
              type="text"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="/app"
              value={workdir}
              onChange={(e) => setWorkdir(e.target.value)}
            />
            {errors.workdir && (
              <p className="text-xs text-destructive">{errors.workdir}</p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">
              <Icon className="h-4 w-4 mr-2" />
              {isSequential ? 'Run Workflow' : 'Analyze'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
