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
  Check
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
import { portApi } from '@/services/api'

interface PortInfo {
  id: number
  container_id: number
  container_name: string
  port: number
  name: string
  protocol: string
  auto_created: boolean
}

export default function Ports() {
  const [ports, setPorts] = useState<PortInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [copiedId, setCopiedId] = useState<number | null>(null)

  const fetchPorts = useCallback(async () => {
    try {
      const response = await portApi.listAll()
      setPorts(response.data || [])
    } catch {
      console.error('Failed to fetch ports')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchPorts()
  }, [fetchPorts])

  const handleDelete = async (containerId: number, port: number) => {
    try {
      await portApi.remove(containerId, port)
      fetchPorts()
    } catch {
      console.error('Failed to delete port')
    }
  }

  const getProxyUrl = (containerId: number, port: number) => {
    const baseUrl = window.location.origin
    return `${baseUrl}/api/proxy/${containerId}/${port}`
  }

  const handleCopy = async (containerId: number, port: number, id: number) => {
    const url = getProxyUrl(containerId, port)
    await navigator.clipboard.writeText(url)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const handleOpen = (containerId: number, port: number) => {
    const url = getProxyUrl(containerId, port)
    window.open(url, '_blank')
  }

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
        <Button variant="outline" size="sm" onClick={fetchPorts}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Ports</CardTitle>
            <Network className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{ports.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">VS Code Instances</CardTitle>
            <Code className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {ports.filter(p => p.name === 'VS Code').length}
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
              {ports.filter(p => !p.auto_created).length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Ports Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Exposed Ports</CardTitle>
        </CardHeader>
        <CardContent>
          {ports.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Network className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No exposed ports yet</p>
              <p className="text-sm">Ports will appear here when you add them to containers</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Container</TableHead>
                  <TableHead>Port</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead>Protocol</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ports.map((port) => (
                  <TableRow key={port.id}>
                    <TableCell className="font-medium">
                      {port.container_name}
                    </TableCell>
                    <TableCell>
                      <code className="bg-muted px-2 py-1 rounded text-sm">
                        {port.port}
                      </code>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {port.name === 'VS Code' && <Code className="h-4 w-4" />}
                        {port.name || '-'}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{port.protocol}</Badge>
                    </TableCell>
                    <TableCell>
                      {port.auto_created ? (
                        <Badge variant="secondary">Auto</Badge>
                      ) : (
                        <Badge>Manual</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCopy(port.container_id, port.port, port.id)}
                        >
                          {copiedId === port.id ? (
                            <Check className="h-4 w-4 text-green-500" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpen(port.container_id, port.port)}
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                        {!port.auto_created && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive"
                            onClick={() => handleDelete(port.container_id, port.port)}
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
            Services are proxied through the backend API. Click the external link icon to open a service in a new tab.
          </p>
          <p>
            <strong>Proxy URL format:</strong>{' '}
            <code className="bg-muted px-2 py-1 rounded">
              {window.location.origin}/api/proxy/&#123;container_id&#125;/&#123;port&#125;
            </code>
          </p>
          <p>
            <strong>Note:</strong> Make sure the service is running inside the container before accessing it.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
