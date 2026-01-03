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
import { portApi, containerApi } from '@/services/api'

interface PortInfo {
  id: number
  container_id: number
  container_name: string
  port: number
  name: string
  protocol: string
  auto_created: boolean
}

interface ContainerInfo {
  id: number
  name: string
  enable_code_server: boolean
  code_server_port: number
}

// code-server internal port (inside container)
const CODE_SERVER_INTERNAL_PORT = 8443

export default function Ports() {
  const [ports, setPorts] = useState<PortInfo[]>([])
  const [containers, setContainers] = useState<ContainerInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [copiedId, setCopiedId] = useState<number | null>(null)

  const fetchData = useCallback(async () => {
    try {
      const [portsRes, containersRes] = await Promise.all([
        portApi.listAll(),
        containerApi.list()
      ])
      setPorts(portsRes.data || [])
      setContainers(containersRes.data || [])
    } catch {
      console.error('Failed to fetch data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleDelete = async (containerId: number, port: number) => {
    try {
      await portApi.remove(containerId, port)
      fetchData()
    } catch {
      console.error('Failed to delete port')
    }
  }

  // Get proxy URL - for code-server, use internal port 8443
  const getProxyUrl = (containerId: number, port: number, serviceName: string) => {
    const baseUrl = window.location.origin
    // For VS Code (code-server), always use internal port 8443
    const targetPort = serviceName === 'VS Code' ? CODE_SERVER_INTERNAL_PORT : port
    return `${baseUrl}/api/proxy/${containerId}/${targetPort}`
  }

  const handleCopy = async (containerId: number, port: number, id: number, serviceName: string) => {
    const url = getProxyUrl(containerId, port, serviceName)
    await navigator.clipboard.writeText(url)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const handleOpen = (containerId: number, port: number, serviceName: string) => {
    const url = getProxyUrl(containerId, port, serviceName)
    window.open(url, '_blank')
  }

  // Build combined list: ports from DB + code-server from containers
  const getAllServices = () => {
    const services: Array<PortInfo & { isCodeServer?: boolean }> = [...ports]
    
    // Add code-server entries for containers that have it enabled
    containers.forEach(container => {
      if (container.enable_code_server) {
        // Check if already in ports list
        const exists = ports.some(
          p => p.container_id === container.id && p.name === 'VS Code'
        )
        if (!exists) {
          services.push({
            id: -container.id, // Negative ID to distinguish
            container_id: container.id,
            container_name: container.name,
            port: CODE_SERVER_INTERNAL_PORT,
            name: 'VS Code',
            protocol: 'http',
            auto_created: true,
            isCodeServer: true
          })
        }
      }
    })
    
    return services
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
                  <TableHead>Protocol</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allServices.map((service) => (
                  <TableRow key={service.id}>
                    <TableCell className="font-medium">
                      {service.container_name}
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
                      <Badge variant="outline">{service.protocol}</Badge>
                    </TableCell>
                    <TableCell>
                      {service.auto_created ? (
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
                          onClick={() => handleCopy(service.container_id, service.port, service.id, service.name)}
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
                          onClick={() => handleOpen(service.container_id, service.port, service.name)}
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                        {!service.auto_created && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive"
                            onClick={() => handleDelete(service.container_id, service.port)}
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
            Services are proxied through Traefik. Click the external link icon to open a service in a new tab.
          </p>
          <p>
            <strong>VS Code (code-server):</strong> Automatically routed through Traefik using container internal port 8443.
          </p>
          <p>
            <strong>Proxy URL format:</strong>{' '}
            <code className="bg-muted px-2 py-1 rounded">
              {window.location.origin}/api/proxy/&#123;container_id&#125;/8443
            </code>
          </p>
          <p>
            <strong>Note:</strong> Make sure the container is running and connected to the Traefik network.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
