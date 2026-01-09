import { useState, useEffect, useCallback } from 'react'
import { 
  RefreshCw, 
  Square, 
  Trash2, 
  Loader2,
  Box,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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
import { dockerApi, DockerContainerInfo } from '@/services/api'

export default function DockerContainers() {
  const [containers, setContainers] = useState<DockerContainerInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<DockerContainerInfo | null>(null)

  const fetchContainers = useCallback(async () => {
    try {
      const response = await dockerApi.listContainers()
      setContainers(response.data || [])
    } catch {
      console.error('Failed to fetch Docker containers')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchContainers()
  }, [fetchContainers])

  const handleStop = async (container: DockerContainerInfo) => {
    setActionLoading(container.id)
    try {
      await dockerApi.stopContainer(container.id)
      fetchContainers()
    } catch (err) {
      console.error('Failed to stop container', err)
    } finally {
      setActionLoading(null)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setActionLoading(deleteTarget.id)
    try {
      await dockerApi.removeContainer(deleteTarget.id)
      fetchContainers()
    } catch (err) {
      console.error('Failed to remove container', err)
    } finally {
      setActionLoading(null)
      setDeleteTarget(null)
    }
  }

  const getStateBadge = (state: string) => {
    switch (state) {
      case 'running':
        return (
          <Badge variant="success" className="flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" />
            Running
          </Badge>
        )
      case 'exited':
        return (
          <Badge variant="secondary" className="flex items-center gap-1">
            <XCircle className="h-3 w-3" />
            Exited
          </Badge>
        )
      case 'created':
        return (
          <Badge variant="outline" className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Created
          </Badge>
        )
      default:
        return (
          <Badge variant="destructive" className="flex items-center gap-1">
            <AlertCircle className="h-3 w-3" />
            {state}
          </Badge>
        )
    }
  }

  const formatCreatedTime = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const runningCount = containers.filter(c => c.state === 'running').length
  const stoppedCount = containers.filter(c => c.state !== 'running').length
  const managedCount = containers.filter(c => c.is_managed).length

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold">Docker Containers</h1>
          <p className="text-sm md:text-base text-muted-foreground">View and manage all Docker containers on this host</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchContainers} className="w-full md:w-auto min-h-[44px]">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total</CardTitle>
            <Box className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{containers.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Running</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">{runningCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Stopped</CardTitle>
            <XCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stoppedCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Managed</CardTitle>
            <AlertCircle className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-500">{managedCount}</div>
          </CardContent>
        </Card>
      </div>

      {/* Containers Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Containers</CardTitle>
        </CardHeader>
        <CardContent>
          {containers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Box className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No Docker containers found</p>
            </div>
          ) : (
            <>
              {/* Desktop Table */}
              <div className="hidden lg:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>ID</TableHead>
                      <TableHead>Image</TableHead>
                      <TableHead>State</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Ports</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {containers.map((container) => (
                      <TableRow key={container.id}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            {container.name}
                            {container.is_managed && (
                              <Badge variant="outline" className="text-xs">Managed</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <code className="bg-muted px-2 py-1 rounded text-xs">
                            {container.id}
                          </code>
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate" title={container.image}>
                          {container.image}
                        </TableCell>
                        <TableCell>{getStateBadge(container.state)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-[150px] truncate" title={container.status}>
                          {container.status}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {container.ports.slice(0, 3).map((port, i) => (
                              <code key={i} className="bg-muted px-1 py-0.5 rounded text-xs">
                                {port}
                              </code>
                            ))}
                            {container.ports.length > 3 && (
                              <span className="text-xs text-muted-foreground">
                                +{container.ports.length - 3}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatCreatedTime(container.created)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            {container.state === 'running' && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleStop(container)}
                                disabled={actionLoading === container.id}
                              >
                                {actionLoading === container.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Square className="h-4 w-4" />
                                )}
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              onClick={() => setDeleteTarget(container)}
                              disabled={actionLoading === container.id}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {/* Mobile/Tablet Cards */}
              <div className="lg:hidden space-y-3">
                {containers.map((container) => (
                  <div key={container.id} className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{container.name}</span>
                        {container.is_managed && (
                          <Badge variant="outline" className="text-xs">Managed</Badge>
                        )}
                      </div>
                      {getStateBadge(container.state)}
                    </div>
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground w-16">ID:</span>
                        <code className="bg-muted px-2 py-0.5 rounded text-xs">{container.id}</code>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="text-muted-foreground w-16 flex-shrink-0">Image:</span>
                        <span className="break-all text-xs">{container.image}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground w-16">Status:</span>
                        <span className="text-xs">{container.status}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground w-16">Created:</span>
                        <span className="text-xs">{formatCreatedTime(container.created)}</span>
                      </div>
                      {container.ports.length > 0 && (
                        <div className="flex items-start gap-2">
                          <span className="text-muted-foreground w-16 flex-shrink-0">Ports:</span>
                          <div className="flex flex-wrap gap-1">
                            {container.ports.slice(0, 3).map((port, i) => (
                              <code key={i} className="bg-muted px-1 py-0.5 rounded text-xs">
                                {port}
                              </code>
                            ))}
                            {container.ports.length > 3 && (
                              <span className="text-xs text-muted-foreground">
                                +{container.ports.length - 3} more
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center justify-end gap-2 pt-2 border-t">
                      {container.state === 'running' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleStop(container)}
                          disabled={actionLoading === container.id}
                          className="min-h-[44px] min-w-[44px]"
                        >
                          {actionLoading === container.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <Square className="h-4 w-4 mr-2" />
                              Stop
                            </>
                          )}
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive min-h-[44px] min-w-[44px]"
                        onClick={() => setDeleteTarget(container)}
                        disabled={actionLoading === container.id}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Help Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">About this page</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            This page shows all Docker containers on the host, including those not managed by this platform.
          </p>
          <p>
            <strong>Managed</strong> containers are created through this platform and tracked in the database.
            <strong> Orphaned</strong> containers may exist if they were created manually or if the database was reset.
          </p>
          <p className="text-destructive">
            <strong>Warning:</strong> Deleting containers here will permanently remove them. This action cannot be undone.
          </p>
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Container</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete container "{deleteTarget?.name}"?
              This will permanently remove the container and all its data.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
