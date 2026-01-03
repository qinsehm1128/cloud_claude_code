import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { 
  Plus, 
  Play, 
  Square, 
  Trash2, 
  Terminal, 
  RefreshCw,
  FileText,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  GitBranch,
  Sparkles,
  Cpu,
  HardDrive,
  Network,
  Globe,
  Link,
  Code,
  Settings2,
  GitFork
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { containerApi, repoApi, PortMapping, ProxyConfig } from '@/services/api'

interface Container {
  id: number
  docker_id: string
  name: string
  status: string
  init_status: string
  init_message?: string
  git_repo_url?: string
  git_repo_name?: string
  created_at: string
}

interface RemoteRepository {
  id: number
  name: string
  full_name: string
  clone_url: string
  private: boolean
}

interface ContainerLog {
  ID: number
  CreatedAt: string
  level: string
  stage: string
  message: string
}

export default function Dashboard() {
  const [containers, setContainers] = useState<Container[]>([])
  const [remoteRepos, setRemoteRepos] = useState<RemoteRepository[]>([])
  const [loading, setLoading] = useState(true)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [logDialogOpen, setLogDialogOpen] = useState(false)
  const [selectedContainerId, setSelectedContainerId] = useState<number | null>(null)
  const [logs, setLogs] = useState<ContainerLog[]>([])
  const [loadingLogs, setLoadingLogs] = useState(false)
  const [creating, setCreating] = useState(false)
  const [loadingRepos, setLoadingRepos] = useState(false)
  const [repoSource, setRepoSource] = useState<'select' | 'url'>('select')
  const [formData, setFormData] = useState({
    name: '',
    selectedRepo: '',
    gitRepoUrl: '',
    skipClaudeInit: false,
    memoryLimit: 2048,
    cpuLimit: 1,
    portMappings: [] as PortMapping[],
    proxy: {
      enabled: false,
      domain: '',
      port: 0,
      service_port: 3000,
    } as ProxyConfig,
    enableCodeServer: false,
  })
  const [newPortMapping, setNewPortMapping] = useState({ container_port: 0, host_port: 0 })
  const navigate = useNavigate()

  const fetchContainers = useCallback(async () => {
    try {
      const response = await containerApi.list()
      setContainers(response.data)
    } catch {
      console.error('Failed to fetch containers')
    }
  }, [])

  const fetchRemoteRepos = async () => {
    setLoadingRepos(true)
    try {
      const response = await repoApi.listRemote()
      setRemoteRepos(response.data || [])
    } catch {
      console.error('Failed to fetch repositories')
    } finally {
      setLoadingRepos(false)
    }
  }

  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      await fetchContainers()
      setLoading(false)
    }
    loadData()
  }, [fetchContainers])

  // Poll for container status updates
  useEffect(() => {
    const initializingContainers = containers.filter(
      c => ['pending', 'cloning', 'initializing'].includes(c.init_status)
    )
    if (initializingContainers.length === 0) return

    const interval = setInterval(fetchContainers, 3000)
    return () => clearInterval(interval)
  }, [containers, fetchContainers])

  const handleOpenCreateDialog = () => {
    setCreateDialogOpen(true)
    fetchRemoteRepos()
  }

  const handleCreate = async () => {
    setCreating(true)
    try {
      let gitRepoUrl = ''
      let gitRepoName = ''

      if (repoSource === 'select' && formData.selectedRepo) {
        const selectedRepo = remoteRepos.find(r => r.clone_url === formData.selectedRepo)
        if (selectedRepo) {
          gitRepoUrl = selectedRepo.clone_url
          gitRepoName = selectedRepo.name
        }
      } else if (repoSource === 'url' && formData.gitRepoUrl) {
        gitRepoUrl = formData.gitRepoUrl
      }

      if (!gitRepoUrl || !formData.name) {
        return
      }

      await containerApi.create(
        formData.name, 
        gitRepoUrl, 
        gitRepoName, 
        formData.skipClaudeInit,
        formData.memoryLimit,
        formData.cpuLimit,
        formData.portMappings,
        formData.proxy.enabled ? formData.proxy : undefined,
        formData.enableCodeServer
      )
      setCreateDialogOpen(false)
      setFormData({ 
        name: '', 
        selectedRepo: '', 
        gitRepoUrl: '', 
        skipClaudeInit: false,
        memoryLimit: 2048,
        cpuLimit: 1,
        portMappings: [],
        proxy: { enabled: false, domain: '', port: 0, service_port: 3000 },
        enableCodeServer: false
      })
      setNewPortMapping({ container_port: 0, host_port: 0 })
      fetchContainers()
    } catch (err) {
      console.error('Failed to create container', err)
    } finally {
      setCreating(false)
    }
  }

  const handleStart = async (id: number) => {
    try {
      await containerApi.start(id)
      fetchContainers()
    } catch (err) {
      console.error('Failed to start container', err)
    }
  }

  const handleStop = async (id: number) => {
    try {
      await containerApi.stop(id)
      fetchContainers()
    } catch (err) {
      console.error('Failed to stop container', err)
    }
  }

  const handleDelete = async (id: number) => {
    try {
      await containerApi.delete(id)
      fetchContainers()
    } catch (err) {
      console.error('Failed to delete container', err)
    }
  }

  const handleViewLogs = async (containerId: number) => {
    setSelectedContainerId(containerId)
    setLogDialogOpen(true)
    setLoadingLogs(true)
    try {
      const response = await containerApi.getLogs(containerId, 50)
      setLogs(response.data || [])
    } catch {
      console.error('Failed to fetch logs')
    } finally {
      setLoadingLogs(false)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'running':
        return <Badge variant="success">Running</Badge>
      case 'stopped':
        return <Badge variant="destructive">Stopped</Badge>
      default:
        return <Badge variant="secondary">{status}</Badge>
    }
  }

  const getInitStatusDisplay = (container: Container) => {
    switch (container.init_status) {
      case 'pending':
        return (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Starting...
            </div>
            <Progress value={10} className="h-1" />
          </div>
        )
      case 'cloning':
        return (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Cloning repository...
            </div>
            <Progress value={40} className="h-1" />
          </div>
        )
      case 'initializing':
        return (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Initializing environment...
            </div>
            <Progress value={70} className="h-1" />
          </div>
        )
      case 'ready':
        return (
          <div className="flex items-center gap-2 text-sm text-success">
            <CheckCircle2 className="h-4 w-4" />
            Ready
          </div>
        )
      case 'failed':
        return (
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm text-destructive">
              <XCircle className="h-4 w-4" />
              Failed
            </div>
            {container.init_message && (
              <p className="text-xs text-muted-foreground truncate">
                {container.init_message}
              </p>
            )}
          </div>
        )
      default:
        return null
    }
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
          <h1 className="text-2xl font-semibold">Containers</h1>
          <p className="text-muted-foreground">Manage your development containers</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchContainers}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button size="sm" onClick={handleOpenCreateDialog}>
            <Plus className="h-4 w-4 mr-2" />
            New Container
          </Button>
        </div>
      </div>

      {/* Container Grid */}
      {containers.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Terminal className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No containers yet</h3>
            <p className="text-muted-foreground text-sm mb-4">
              Create your first container to get started
            </p>
            <Button onClick={handleOpenCreateDialog}>
              <Plus className="h-4 w-4 mr-2" />
              Create Container
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {containers.map((container) => (
            <Card key={container.id} className="relative">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-base">{container.name}</CardTitle>
                    {container.git_repo_name && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <GitBranch className="h-3 w-3" />
                        {container.git_repo_name}
                      </div>
                    )}
                  </div>
                  {getStatusBadge(container.status)}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Init Status */}
                {getInitStatusDisplay(container)}

                {/* Created Time */}
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {new Date(container.created_at).toLocaleString()}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 pt-2 border-t">
                  {container.status === 'running' ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleStop(container.id)}
                    >
                      <Square className="h-3 w-3 mr-1" />
                      Stop
                    </Button>
                  ) : container.init_status === 'ready' ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleStart(container.id)}
                    >
                      <Play className="h-3 w-3 mr-1" />
                      Start
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" disabled>
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      Initializing
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleViewLogs(container.id)}
                  >
                    <FileText className="h-3 w-3 mr-1" />
                    Logs
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate(`/terminal/${container.id}`)}
                    disabled={container.status !== 'running' || container.init_status !== 'ready'}
                  >
                    <Terminal className="h-3 w-3 mr-1" />
                    Terminal
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => handleDelete(container.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-[550px] max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Create Container</DialogTitle>
            <DialogDescription>
              Create a new development container from a GitHub repository
            </DialogDescription>
          </DialogHeader>
          
          <Tabs defaultValue="basic" className="flex-1 flex flex-col min-h-0">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="basic" className="flex items-center gap-1">
                <GitFork className="h-3 w-3" />
                Basic
              </TabsTrigger>
              <TabsTrigger value="resources" className="flex items-center gap-1">
                <Cpu className="h-3 w-3" />
                Resources
              </TabsTrigger>
              <TabsTrigger value="network" className="flex items-center gap-1">
                <Network className="h-3 w-3" />
                Network
              </TabsTrigger>
            </TabsList>
            
            <div className="flex-1 mt-4 overflow-hidden">
              {/* Basic Tab */}
              <TabsContent value="basic" className="mt-0 h-full" forceMount>
                <ScrollArea className="h-[45vh] pr-4">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Container Name</Label>
                      <Input
                        id="name"
                        placeholder="my-project"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label>Repository Source</Label>
                      <Select value={repoSource} onValueChange={(v: 'select' | 'url') => setRepoSource(v)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="select">Select from GitHub</SelectItem>
                          <SelectItem value="url">Enter URL manually</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    {repoSource === 'select' ? (
                      <div className="space-y-2">
                        <Label>GitHub Repository</Label>
                        <Select
                          value={formData.selectedRepo}
                          onValueChange={(v) => setFormData({ ...formData, selectedRepo: v })}
                          disabled={loadingRepos}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={loadingRepos ? "Loading..." : "Select a repository"} />
                          </SelectTrigger>
                          <SelectContent>
                            {remoteRepos.map((repo) => (
                              <SelectItem key={repo.id} value={repo.clone_url}>
                                {repo.full_name}
                                {repo.private && " (Private)"}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Label htmlFor="url">Repository URL</Label>
                        <Input
                          id="url"
                          placeholder="https://github.com/username/repository"
                          value={formData.gitRepoUrl}
                          onChange={(e) => setFormData({ ...formData, gitRepoUrl: e.target.value })}
                        />
                      </div>
                    )}
                    
                    <div className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
                      <p className="font-medium mb-1">What happens next:</p>
                      <ol className="list-decimal list-inside space-y-1 text-xs">
                        <li>Container will be created and started</li>
                        <li>Repository will be cloned inside</li>
                        {!formData.skipClaudeInit && <li>Claude Code will set up the environment</li>}
                        <li>Once ready, you can access the terminal</li>
                      </ol>
                    </div>
                    
                    <div className="space-y-3 pt-2 border-t">
                      <Label className="flex items-center gap-2 text-muted-foreground">
                        <Settings2 className="h-4 w-4" />
                        Options
                      </Label>
                      
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="skipClaudeInit"
                          checked={formData.skipClaudeInit}
                          onCheckedChange={(checked) => 
                            setFormData({ ...formData, skipClaudeInit: checked === true })
                          }
                        />
                        <label htmlFor="skipClaudeInit" className="text-sm leading-none flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-muted-foreground" />
                          Skip Claude Code initialization
                        </label>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="enableCodeServer"
                          checked={formData.enableCodeServer}
                          onCheckedChange={(checked) => 
                            setFormData({ ...formData, enableCodeServer: checked === true })
                          }
                        />
                        <label htmlFor="enableCodeServer" className="text-sm leading-none flex items-center gap-2">
                          <Code className="h-4 w-4 text-muted-foreground" />
                          Enable Web VS Code (code-server)
                        </label>
                      </div>
                    </div>
                  </div>
                </ScrollArea>
              </TabsContent>

              {/* Resources Tab */}
              <TabsContent value="resources" className="mt-0 h-full" forceMount>
                <ScrollArea className="h-[45vh] pr-4">
                  <div className="space-y-4">
                    <div className="space-y-3">
                      <Label className="flex items-center gap-2">
                        <Cpu className="h-4 w-4" />
                        Resource Limits
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Configure CPU and memory limits for the container
                      </p>
                      
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label htmlFor="memory" className="text-xs text-muted-foreground flex items-center gap-1">
                            <HardDrive className="h-3 w-3" />
                            Memory (MB)
                          </Label>
                          <Input
                            id="memory"
                            type="number"
                            min={512}
                            max={16384}
                            value={formData.memoryLimit}
                            onChange={(e) => setFormData({ ...formData, memoryLimit: parseInt(e.target.value) || 2048 })}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="cpu" className="text-xs text-muted-foreground flex items-center gap-1">
                            <Cpu className="h-3 w-3" />
                            CPU (cores)
                          </Label>
                          <Input
                            id="cpu"
                            type="number"
                            min={0.5}
                            max={8}
                            step={0.5}
                            value={formData.cpuLimit}
                            onChange={(e) => setFormData({ ...formData, cpuLimit: parseFloat(e.target.value) || 1 })}
                          />
                        </div>
                      </div>
                    </div>
                    
                    <div className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
                      <p><strong>Recommended:</strong></p>
                      <ul className="list-disc list-inside mt-1 space-y-1">
                        <li>Small projects: 1GB RAM, 0.5 CPU</li>
                        <li>Medium projects: 2GB RAM, 1 CPU</li>
                        <li>Large projects: 4GB+ RAM, 2+ CPU</li>
                      </ul>
                    </div>
                  </div>
                </ScrollArea>
              </TabsContent>

              {/* Network Tab */}
              <TabsContent value="network" className="mt-0 h-full" forceMount>
                <ScrollArea className="h-[45vh] pr-4">
                  <div className="space-y-4">
                    {/* Traefik Proxy */}
                    <div className="space-y-3">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="proxyEnabled"
                          checked={formData.proxy.enabled}
                          onCheckedChange={(checked) => 
                            setFormData({ 
                              ...formData, 
                              proxy: { ...formData.proxy, enabled: checked === true }
                            })
                          }
                        />
                        <label htmlFor="proxyEnabled" className="text-sm font-medium leading-none flex items-center gap-2">
                          <Globe className="h-4 w-4 text-muted-foreground" />
                          Enable Traefik Proxy
                        </label>
                      </div>
                      
                      {formData.proxy.enabled && (
                        <div className="space-y-3 pl-6 border-l-2 border-muted">
                          <div className="space-y-2">
                            <Label htmlFor="servicePort" className="text-xs">Container Service Port</Label>
                            <Input
                              id="servicePort"
                              type="number"
                              placeholder="3000"
                              min={1}
                              max={65535}
                              value={formData.proxy.service_port || ''}
                              onChange={(e) => setFormData({ 
                                ...formData, 
                                proxy: { ...formData.proxy, service_port: parseInt(e.target.value) || 0 }
                              })}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="proxyDomain" className="text-xs flex items-center gap-1">
                              <Globe className="h-3 w-3" />
                              Domain (optional)
                            </Label>
                            <Input
                              id="proxyDomain"
                              placeholder="myapp.example.com"
                              value={formData.proxy.domain || ''}
                              onChange={(e) => setFormData({ 
                                ...formData, 
                                proxy: { ...formData.proxy, domain: e.target.value }
                              })}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="proxyPort" className="text-xs flex items-center gap-1">
                              <Link className="h-3 w-3" />
                              Direct Port (optional)
                            </Label>
                            <Select
                              value={formData.proxy.port?.toString() || '0'}
                              onValueChange={(v) => setFormData({ 
                                ...formData, 
                                proxy: { ...formData.proxy, port: parseInt(v) || 0 }
                              })}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select port" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="0">None</SelectItem>
                                {Array.from({ length: 20 }, (_, i) => 30001 + i).map(p => (
                                  <SelectItem key={p} value={p.toString()}>{p}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Legacy Port Mappings */}
                    <div className="space-y-3 pt-3 border-t">
                      <Label className="flex items-center gap-2 text-muted-foreground">
                        <Network className="h-4 w-4" />
                        Direct Port Mappings
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Map container ports directly to host (without Traefik)
                      </p>
                      
                      {formData.portMappings.length > 0 && (
                        <div className="space-y-2">
                          {formData.portMappings.map((pm, index) => (
                            <div key={index} className="flex items-center gap-2 text-sm bg-muted rounded px-2 py-1">
                              <span>{pm.container_port}</span>
                              <span className="text-muted-foreground">→</span>
                              <span>{pm.host_port}</span>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 ml-auto text-destructive"
                                onClick={() => {
                                  const newMappings = [...formData.portMappings]
                                  newMappings.splice(index, 1)
                                  setFormData({ ...formData, portMappings: newMappings })
                                }}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                      
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          placeholder="Container"
                          className="w-24"
                          min={1}
                          max={65535}
                          value={newPortMapping.container_port || ''}
                          onChange={(e) => setNewPortMapping({ ...newPortMapping, container_port: parseInt(e.target.value) || 0 })}
                        />
                        <span className="text-muted-foreground">→</span>
                        <Input
                          type="number"
                          placeholder="Host"
                          className="w-24"
                          min={1}
                          max={65535}
                          value={newPortMapping.host_port || ''}
                          onChange={(e) => setNewPortMapping({ ...newPortMapping, host_port: parseInt(e.target.value) || 0 })}
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            if (newPortMapping.container_port > 0 && newPortMapping.host_port > 0) {
                              setFormData({
                                ...formData,
                                portMappings: [...formData.portMappings, newPortMapping]
                              })
                              setNewPortMapping({ container_port: 0, host_port: 0 })
                            }
                          }}
                          disabled={!newPortMapping.container_port || !newPortMapping.host_port}
                        >
                          <Plus className="h-3 w-3 mr-1" />
                          Add
                        </Button>
                      </div>
                    </div>
                  </div>
                </ScrollArea>
              </TabsContent>
            </div>
          </Tabs>
          
          <DialogFooter className="mt-4 pt-4 border-t">
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={creating || !formData.name}>
              {creating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Logs Dialog */}
      <Dialog open={logDialogOpen} onOpenChange={setLogDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Container Logs</DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-[400px] rounded-md border p-4">
            {loadingLogs ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : logs.length === 0 ? (
              <p className="text-center text-muted-foreground">No logs yet</p>
            ) : (
              <div className="space-y-3">
                {logs.slice().reverse().map((log) => (
                  <div key={log.ID} className="text-sm">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge
                        variant={
                          log.level === 'error' ? 'destructive' :
                          log.level === 'warn' ? 'warning' : 'secondary'
                        }
                        className="text-xs"
                      >
                        {log.stage}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(log.CreatedAt).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-muted-foreground">{log.message}</p>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => selectedContainerId && handleViewLogs(selectedContainerId)}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Button onClick={() => setLogDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
