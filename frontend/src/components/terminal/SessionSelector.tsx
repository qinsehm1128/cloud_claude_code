import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertCircle, Circle, Loader2, Plus, RefreshCw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { getTerminalSessions } from '@/services/api'
import type { TerminalSessionInfo } from '@/types/conversation'

export interface SessionSelectorProps {
  containerId: number | string | null
  onSelect: (sessionId: string) => void
  onCreateNew: () => void
  className?: string
}

function formatDateTime(value: string): string {
  if (!value) {
    return '--'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleString()
}

function getDisplaySessionId(sessionId: string): string {
  if (sessionId.length <= 16) {
    return sessionId
  }

  return `${sessionId.slice(0, 8)}...${sessionId.slice(-6)}`
}

export function SessionSelector({
  containerId,
  onSelect,
  onCreateNew,
  className,
}: SessionSelectorProps) {
  const [sessions, setSessions] = useState<TerminalSessionInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const normalizedContainerId = useMemo(() => {
    if (containerId === null || containerId === undefined || containerId === '') {
      return null
    }

    const id = typeof containerId === 'string' ? Number(containerId) : containerId
    return Number.isFinite(id) ? id : null
  }, [containerId])

  const loadSessions = useCallback(async () => {
    if (normalizedContainerId === null) {
      setSessions([])
      setError(null)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const response = await getTerminalSessions(normalizedContainerId)
      const orderedSessions = [...response].sort((first, second) => {
        return new Date(second.last_active).getTime() - new Date(first.last_active).getTime()
      })
      setSessions(orderedSessions)
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'Failed to load sessions'
      setSessions([])
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [normalizedContainerId])

  useEffect(() => {
    void loadSessions()
  }, [loadSessions])

  const handleCreateNew = useCallback(() => {
    onCreateNew()
  }, [onCreateNew])

  return (
    <Card className={cn('w-full', className)}>
      <CardHeader className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-base sm:text-lg">Session Selector</CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              Select an active terminal session or create a new one.
            </CardDescription>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 px-3"
              onClick={() => void loadSessions()}
              disabled={loading || normalizedContainerId === null}
            >
              <RefreshCw className={cn('mr-2 h-4 w-4', loading && 'animate-spin')} />
              Refresh
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-9 px-3"
              onClick={handleCreateNew}
              disabled={normalizedContainerId === null}
            >
              <Plus className="mr-2 h-4 w-4" />
              New Session
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {normalizedContainerId === null && (
          <div className="rounded-md border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
            Select a container first.
          </div>
        )}

        {normalizedContainerId !== null && loading && (
          <div className="flex items-center justify-center gap-2 rounded-md border border-dashed px-4 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading sessions...
          </div>
        )}

        {normalizedContainerId !== null && !loading && error && (
          <div className="space-y-3 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-4">
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              <span>{error}</span>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => void loadSessions()}>
              Retry
            </Button>
          </div>
        )}

        {normalizedContainerId !== null && !loading && !error && sessions.length === 0 && (
          <div className="rounded-md border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
            No active terminal sessions.
          </div>
        )}

        {normalizedContainerId !== null && !loading && !error && sessions.length > 0 && (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2" data-testid="session-list">
            {sessions.map((session) => (
              <div
                key={session.id}
                role="button"
                tabIndex={0}
                onClick={() => onSelect(session.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    onSelect(session.id)
                  }
                }}
                className="group rounded-lg border px-3 py-3 text-left transition hover:border-primary/60 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium" title={session.id}>
                    Session {getDisplaySessionId(session.id)}
                  </span>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-[11px]">
                      {session.client_count} connected
                    </Badge>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Circle
                        data-testid={`session-status-${session.id}`}
                        className={cn(
                          'h-3.5 w-3.5 fill-current',
                          session.running ? 'text-emerald-500' : 'text-gray-400'
                        )}
                      />
                      {session.running ? 'Running' : 'Stopped'}
                    </span>
                  </div>
                </div>

                <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground sm:text-sm">
                  <div className="col-span-2">
                    <dt className="font-medium text-foreground/80">Session ID</dt>
                    <dd className="truncate" title={session.id}>{session.id}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-foreground/80">Size</dt>
                    <dd>{session.width} x {session.height}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-foreground/80">Container</dt>
                    <dd className="truncate" title={session.container_id}>{session.container_id}</dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="font-medium text-foreground/80">Created</dt>
                    <dd>{formatDateTime(session.created_at)}</dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="font-medium text-foreground/80">Last Active</dt>
                    <dd>{formatDateTime(session.last_active)}</dd>
                  </div>
                </dl>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default SessionSelector
