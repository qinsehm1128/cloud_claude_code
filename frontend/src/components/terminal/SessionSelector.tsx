import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertCircle, Circle, Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { toast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'
import { containerApi, getContainerConversations } from '@/services/api'
import type { ConversationInfo } from '@/types/conversation'

export interface SessionSelectorProps {
  containerId: number | string | null
  onSelect: (conversationId: number) => void
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

export function SessionSelector({
  containerId,
  onSelect,
  onCreateNew,
  className,
}: SessionSelectorProps) {
  const [sessions, setSessions] = useState<ConversationInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingDeleteSession, setPendingDeleteSession] = useState<ConversationInfo | null>(null)
  const [deletingSessionId, setDeletingSessionId] = useState<number | null>(null)

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
      const response = await getContainerConversations(normalizedContainerId)
      const orderedSessions = [...response].sort((first, second) => {
        return new Date(second.updated_at).getTime() - new Date(first.updated_at).getTime()
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

  const handleRequestDelete = useCallback((session: ConversationInfo, event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()

    if (session.is_running) {
      toast.error('Cannot Delete Session', 'Running sessions cannot be deleted')
      return
    }

    setPendingDeleteSession(session)
  }, [])

  const handleDelete = useCallback(async () => {
    if (normalizedContainerId === null || pendingDeleteSession === null) {
      return
    }

    if (pendingDeleteSession.is_running) {
      toast.error('Cannot Delete Session', 'Running sessions cannot be deleted')
      setPendingDeleteSession(null)
      return
    }

    setDeletingSessionId(pendingDeleteSession.id)

    try {
      await containerApi.deleteConversation(normalizedContainerId, pendingDeleteSession.id)
      toast.success('Success', 'Session deleted successfully')
      setPendingDeleteSession(null)
      await loadSessions()
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : 'Failed to delete session'
      toast.error('Delete Failed', message)
    } finally {
      setDeletingSessionId(null)
    }
  }, [loadSessions, normalizedContainerId, pendingDeleteSession])

  const handleDeleteDialogOpenChange = useCallback((open: boolean) => {
    if (!open && deletingSessionId === null) {
      setPendingDeleteSession(null)
    }
  }, [deletingSessionId])

  return (
    <Card className={cn('w-full', className)}>
      <CardHeader className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-base sm:text-lg">Session Selector</CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              Select an active session or create a new one.
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
            No active sessions.
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
                  <span className="truncate text-sm font-medium">
                    {session.title?.trim() || `Session ${session.id}`}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Circle
                        data-testid={`session-status-${session.id}`}
                        className={cn(
                          'h-3.5 w-3.5 fill-current',
                          session.is_running ? 'text-emerald-500' : 'text-gray-400'
                        )}
                      />
                      {session.is_running ? 'Running' : 'Idle'}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      data-testid={`delete-session-${session.id}`}
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                      title={session.is_running ? 'Running sessions cannot be deleted' : 'Delete session'}
                      aria-label={`Delete session ${session.id}`}
                      onClick={(event) => handleRequestDelete(session, event)}
                      disabled={session.is_running || deletingSessionId === session.id}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground sm:text-sm">
                  <div>
                    <dt className="font-medium text-foreground/80">ID</dt>
                    <dd>{session.id}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-foreground/80">Turns</dt>
                    <dd>{session.total_turns}</dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="font-medium text-foreground/80">Created</dt>
                    <dd>{formatDateTime(session.created_at)}</dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="font-medium text-foreground/80">State</dt>
                    <dd>{session.state || '--'}</dd>
                  </div>
                </dl>
              </div>
            ))}
          </div>
        )}

        <AlertDialog open={pendingDeleteSession !== null} onOpenChange={handleDeleteDialogOpenChange}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Session</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete
                {' '}
                "{pendingDeleteSession?.title?.trim() || `Session ${pendingDeleteSession?.id ?? ''}`}"
                ?
                This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deletingSessionId !== null}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={(event) => {
                  event.preventDefault()
                  void handleDelete()
                }}
                disabled={deletingSessionId !== null}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deletingSessionId !== null ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  'Delete'
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  )
}

export default SessionSelector
