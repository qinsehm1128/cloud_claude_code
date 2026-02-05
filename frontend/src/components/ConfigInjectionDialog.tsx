/**
 * ConfigInjectionDialog - Dialog for manually injecting Claude configurations into a running container
 */

import { useState, useEffect, useCallback } from 'react'
import { Loader2, Download, AlertCircle, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { claudeConfigApi } from '@/services/claudeConfigApi'
import { containerApi } from '@/services/api'
import type { ClaudeConfigTemplate, ConfigType, InjectionStatus } from '@/types/claudeConfig'

interface ConfigInjectionDialogProps {
  containerId: number
  containerName: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

// Group configs by type for display
const configTypeLabels: Record<ConfigType, string> = {
  CLAUDE_MD: 'CLAUDE.md Templates',
  SKILL: 'Skills',
  MCP: 'MCP Servers',
  COMMAND: 'Commands',
}

const configTypeOrder: ConfigType[] = ['CLAUDE_MD', 'SKILL', 'MCP', 'COMMAND']

export function ConfigInjectionDialog({
  containerId,
  containerName,
  open,
  onOpenChange,
}: ConfigInjectionDialogProps) {
  const [configs, setConfigs] = useState<ClaudeConfigTemplate[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(false)
  const [injecting, setInjecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<InjectionStatus | null>(null)

  // Load configs when dialog opens
  useEffect(() => {
    if (open) {
      loadConfigs()
      setSelectedIds(new Set())
      setError(null)
      setResult(null)
    }
  }, [open])

  const loadConfigs = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await claudeConfigApi.list()
      setConfigs(response.data || [])
    } catch (err) {
      setError('Failed to load configuration templates')
      console.error('Failed to load configs:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleToggle = useCallback((id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const handleSelectAll = useCallback((type: ConfigType) => {
    const typeConfigs = configs.filter(c => c.config_type === type)
    setSelectedIds(prev => {
      const next = new Set(prev)
      const allSelected = typeConfigs.every(c => next.has(c.id))
      if (allSelected) {
        // Deselect all of this type
        typeConfigs.forEach(c => next.delete(c.id))
      } else {
        // Select all of this type
        typeConfigs.forEach(c => next.add(c.id))
      }
      return next
    })
  }, [configs])

  const handleInject = async () => {
    if (selectedIds.size === 0) return

    setInjecting(true)
    setError(null)
    setResult(null)

    try {
      const response = await containerApi.injectConfigs(containerId, Array.from(selectedIds))
      setResult(response.data.status as InjectionStatus)
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Failed to inject configurations')
    } finally {
      setInjecting(false)
    }
  }

  // Group configs by type
  const groupedConfigs = configTypeOrder.reduce((acc, type) => {
    const typeConfigs = configs.filter(c => c.config_type === type)
    if (typeConfigs.length > 0) {
      acc[type] = typeConfigs
    }
    return acc
  }, {} as Record<ConfigType, ClaudeConfigTemplate[]>)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Inject Claude Configurations</DialogTitle>
          <DialogDescription>
            Select configurations to inject into container "{containerName}"
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto py-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : error && !result ? (
            <div className="flex items-center gap-2 p-4 text-destructive bg-destructive/10 rounded-md">
              <AlertCircle className="h-5 w-5" />
              {error}
            </div>
          ) : result ? (
            // Show injection result
            <div className="space-y-4">
              {result.successful?.length > 0 && (
                <div className="p-3 bg-green-500/10 rounded-md">
                  <div className="flex items-center gap-2 text-green-500 font-medium mb-2">
                    <CheckCircle2 className="h-4 w-4" />
                    Successfully Injected ({result.successful.length})
                  </div>
                  <ul className="text-sm text-muted-foreground space-y-1 ml-6">
                    {result.successful.map((name, i) => (
                      <li key={i}>{name}</li>
                    ))}
                  </ul>
                </div>
              )}
              {result.failed?.length > 0 && (
                <div className="p-3 bg-destructive/10 rounded-md">
                  <div className="flex items-center gap-2 text-destructive font-medium mb-2">
                    <AlertCircle className="h-4 w-4" />
                    Failed ({result.failed.length})
                  </div>
                  <ul className="text-sm space-y-2 ml-6">
                    {result.failed.map((f, i) => (
                      <li key={i}>
                        <span className="font-medium">{f.template_name}</span>
                        <span className="text-muted-foreground"> - {f.reason}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {result.warnings?.length > 0 && (
                <div className="p-3 bg-yellow-500/10 rounded-md">
                  <div className="text-yellow-500 font-medium mb-2">Warnings</div>
                  <ul className="text-sm text-muted-foreground space-y-1 ml-6">
                    {result.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : configs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No configuration templates found. Create some in Settings.
            </div>
          ) : (
            // Show config selection
            <div className="space-y-6">
              {Object.entries(groupedConfigs).map(([type, typeConfigs]) => {
                const allSelected = typeConfigs.every(c => selectedIds.has(c.id))
                const someSelected = typeConfigs.some(c => selectedIds.has(c.id))

                return (
                  <div key={type} className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id={`type-${type}`}
                        checked={allSelected}
                        className={someSelected && !allSelected ? 'opacity-50' : ''}
                        onCheckedChange={() => handleSelectAll(type as ConfigType)}
                      />
                      <label
                        htmlFor={`type-${type}`}
                        className="text-sm font-medium cursor-pointer"
                      >
                        {configTypeLabels[type as ConfigType]}
                      </label>
                      <span className="text-xs text-muted-foreground">
                        ({typeConfigs.length})
                      </span>
                    </div>
                    <div className="ml-6 space-y-1">
                      {typeConfigs.map(config => (
                        <div key={config.id} className="flex items-start gap-2">
                          <Checkbox
                            id={`config-${config.id}`}
                            checked={selectedIds.has(config.id)}
                            onCheckedChange={() => handleToggle(config.id)}
                          />
                          <label
                            htmlFor={`config-${config.id}`}
                            className="text-sm cursor-pointer flex-1"
                          >
                            <span>{config.name}</span>
                            {config.description && (
                              <span className="text-muted-foreground ml-2">
                                - {config.description}
                              </span>
                            )}
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <DialogFooter>
          {result ? (
            <Button onClick={() => onOpenChange(false)}>
              Close
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleInject}
                disabled={selectedIds.size === 0 || injecting || loading}
              >
                {injecting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Injecting...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4 mr-2" />
                    Inject ({selectedIds.size})
                  </>
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
