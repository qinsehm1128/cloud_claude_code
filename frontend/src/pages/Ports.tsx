import { useState, useEffect, useCallback } from 'react'
import { 
  RefreshCw, 
  ExternalLink, 
  Trash2, 
  Loader2,
  Network,
  Globe,
  Code,
  Copy,
  Check,
  Zap,
  CheckCircle,
  XCircle,
  AlertCircle
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
import { portApi } from '@/services/api'

interface PortInfo {
  id: number
  container_id: number
  container_name: string
  port: number
  name: string
  protocol: string
  auto_created: boolean
  code_server_domain?: string  // Subdomain for code-server access
}

type TestStatus = 'idle' | 'testing' | 'success' | 'error'

export default function Ports() {
  const [ports, setPorts] = useState<PortInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [copiedId, setCopiedId] = useState<number | null>(null)
  const [testStatus, setTestStatus] = useState<Record<number, TestStatus>>({})
  const [deleteTarget, setDeleteTarget] = useState<{ containerId: number; port: number; name: string } | null>(null)

  const fetchData = useCallback(async () => {
    try {
      const portsRes = await portApi.listAll()
      setPorts(portsRes.data || [])
    } catch {
      console.error('Failed to fetch data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await portApi.remove(deleteTarget.containerId, deleteTarget.port)
      fetchData()
    } catch {
      console.error('Failed to delete port')
    } finally {
      setDeleteTarget(null)
    }
  }

  // Get service URL - for VS Code, use subdomain if available, otherwise direct host port
  const getServiceUrl = (port: number, serviceName: string, codeServerDomain?: string) => {
    // For VS Code (code-server), prefer subdomain routing if available
    if (serviceName === 'VS Code') {
      if (codeServerDomain) {
        // Use subdomain routing via Traefik
        const protocol = window.location.protocol
        return `${protocol}//${codeServerDomain}`
      }
      // Fallback to direct port access
      const hostname = window.location.hostname
      return `http://${hostname}:${port}`
    }
    // For other services, use proxy
    const baseUrl = window.location.origin
    return `${baseUrl}/api/proxy/${port}`
  }

  const handleCopy = async (_containerId: number, port: number, id: number, serviceName: string, codeServerDomain?: string) => {
    const url = getServiceUrl(port, serviceName, codeServerDomain)
    await navigator.clipboard.writeText(url)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const handleOpen = (_containerId: number, port: number, serviceName: string, codeServerDomain?: string) => {
    const url = getServiceUrl(port, serviceName, codeServerDomain)
    window.open(url, '_blank')
  }

  const handleTest = async (_containerId: number, port: number, id: number, serviceName: string, codeServerDomain?: string) => {
    setTestStatus(prev => ({ ...prev, [id]: 'testing' }))
    const url = getServiceUrl(port, serviceName, codeServerDomain)
    
    try {
      await fetch(url, { 
        method: 'HEAD',
        mode: 'no-cors' // Direct port access may have CORS issues
      })
      // With no-cors, we can't read the response, but if it doesn't throw, it's likely reachable
      setTestStatus(prev => ({ ...prev, [id]: 'success' }))
    } catch {
      setTestStatus(prev => ({ ...prev, [id]: 'error' }))
    }
    
    // Reset status after 3 seconds
    setTimeout(() => {
      setTestStatus(prev => ({ ...prev, [id]: 'idle' }))
    }, 3000)
  }

  // Get all services from ports table (code-server ports are now stored in DB)
  const getAllServices = () => {
    return ports
  }

  const getTestIcon = (id: number) => {
    const status = testStatus[id] || 'idle'
    switch (status) {
      case 'testing':
        return <Loader2 className="h-4 w-4 animate-spin" />
      case 'success':
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case 'error':
        return <XCircle className="h-4 w-4 text-red-500" />
      default:
        return <Zap className="h-4 w-4" />
    }
  }

  const allServices = getAllServices()

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Exposed Ports</h1>
          <p className="text-muted-foreground">View and manage all exposed container services</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Services</CardTitle>
            <Network className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{allServices.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">VS Code Instances</CardTitle>
            <Code className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {allServices.filter(p => p.name === 'VS Code').length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Custom Services</CardTitle>
            <Globe className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {allServices.filter(p => !p.auto_created).length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Ports Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Exposed Services</CardTitle>
        </CardHeader>
        <CardContent>
          {allServices.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Network className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No exposed services yet</p>
              <p className="text-sm">Services will appear here when you create containers with code-server enabled</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Container</TableHead>
                  <TableHead>Port</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead>Access URL</TableHead>
                  <TableHead>Protocol</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allServices.map((service) => (
                  <TableRow key={service.id}>
                    <TableCell className="font-medium">
                      {service.container_name || <span className="text-muted-foreground italic">Unknown</span>}
                    </TableCell>
                    <TableCell>
                      <code className="bg-muted px-2 py-1 rounded text-sm">
                        {service.port}
                      </code>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {service.name === 'VS Code' && <Code className="h-4 w-4" />}
                        {service.name || '-'}
                      </div>
                    </TableCell>
                    <TableCell>
                      {service.name === 'VS Code' && service.code_server_domain ? (
                        <div className="flex items-center gap-1">
                          <Globe className="h-3 w-3 text-green-500" />
                          <code className="bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300 px-2 py-1 rounded text-xs">
                            {service.code_server_domain}
                          </code>
                        </div>
                      ) : (
                        <code className="bg-muted px-2 py-1 rounded text-xs">
                          :{service.port}
                        </code>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{service.protocol}</Badge>
                    </TableCell>
                    <TableCell>
                      {service.auto_created ? (
                        <Badge variant="secondary">Auto</Badge>
                      ) : (
                        <Badge>Manual</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {testStatus[service.id] === 'success' && (
                        <Badge variant="outline" className="text-green-600 border-green-600">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          OK
                        </Badge>
                      )}
                      {testStatus[service.id] === 'error' && (
                        <Badge variant="outline" className="text-red-600 border-red-600">
                          <AlertCircle className="h-3 w-3 mr-1" />
                          Failed
                        </Badge>
                      )}
                      {testStatus[service.id] === 'testing' && (
                        <Badge variant="outline">
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          Testing
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          title="Test connection"
                          onClick={() => handleTest(service.container_id, service.port, service.id, service.name, service.code_server_domain)}
                          disabled={testStatus[service.id] === 'testing'}
                        >
                          {getTestIcon(service.id)}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          title="Copy URL"
                          onClick={() => handleCopy(service.container_id, service.port, service.id, service.name, service.code_server_domain)}
                        >
                          {copiedId === service.id ? (
                            <Check className="h-4 w-4 text-green-500" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          title="Open in new tab"
                          onClick={() => handleOpen(service.container_id, service.port, service.name, service.code_server_domain)}
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                        {/* Show delete for all DB ports (id > 0) */}
                        {service.id > 0 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Delete port"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setDeleteTarget({ 
                              containerId: service.container_id, 
                              port: service.port,
                              name: service.name 
                            })}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Help Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">How to access services</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            <strong>VS Code (code-server) - Subdomain Mode:</strong> When <code>CODE_SERVER_BASE_DOMAIN</code> is configured,
            code-server is accessible via subdomain (e.g., <code>mycontainer.code.example.com</code>).
            This requires DNS wildcard record and Nginx configuration.
          </p>
          <p>
            <strong>VS Code (code-server) - Direct Port Mode:</strong> When subdomain is not configured,
            code-server is accessed directly via host port (e.g., <code>http://server:18443</code>).
          </p>
          <p>
            <strong>Test Connection:</strong> Click the lightning bolt icon to test if the service is reachable.
          </p>
          <p>
            <strong>Note:</strong> Make sure the container is running and the service is started inside the container.
          </p>
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Port Record</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the port record for "{deleteTarget?.name}" (port {deleteTarget?.port})?
              This only removes the record from the database, it does not stop any running service.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
