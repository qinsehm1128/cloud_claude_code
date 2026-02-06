import { useState, useEffect, useCallback, useRef } from 'react'
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
  GitFork,
  AlertTriangle,
  FileCode,
  Info,
  Shield
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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { containerApi, repoApi, configProfileApi, PortMapping, ProxyConfig, GitHubTokenItem, EnvVarsProfile, StartupCommandProfile, ClaudeConfigSelection } from '@/services/api'
import { claudeConfigApi } from '@/services/claudeConfigApi'
import { ClaudeConfigTemplate, ConfigTypes, InjectionStatus } from '@/types/claudeConfig'
import ConfigPreview from '@/components/ConfigPreview'
import { toast } from '@/components/ui/toast'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

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
  injection_status?: InjectionStatus
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
  // Config profiles state
  const [githubTokens, setGithubTokens] = useState<GitHubTokenItem[]>([])
  const [envProfiles, setEnvProfiles] = useState<EnvVarsProfile[]>([])
  const [commandProfiles, setCommandProfiles] = useState<StartupCommandProfile[]>([])
  const [loadingProfiles, setLoadingProfiles] = useState(false)
  // Claude config templates state
  const [claudeConfigs, setClaudeConfigs] = useState<ClaudeConfigTemplate[]>([])
  const [loadingClaudeConfigs, setLoadingClaudeConfigs] = useState(false)
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
    // Config profile selections
    githubTokenId: undefined as number | undefined,
    envProfileId: undefined as number | undefined,
    commandProfileId: undefined as number | undefined,
    // New fields for claude config management
    skipGitRepo: false,
    enableYoloMode: false,
    runAsRoot: false,
    selectedClaudeMD: undefined as number | undefined,
    selectedSkills: [] as number[],
    selectedMCPs: [] as number[],
    selectedCommands: [] as number[],
    selectedCodexConfigs: [] as number[],
    selectedCodexAuths: [] as number[],
    selectedGeminiEnvs: [] as number[],
  })
  const [newPortMapping, setNewPortMapping] = useState({ container_port: 0, host_port: 0 })
  const navigate = useNavigate()
  // Track containers we've already shown injection status notifications for
  const notifiedContainersRef = useRef<Set<number>>(new Set())

  // Check for injection status and show notifications for newly ready containers
  const checkInjectionStatusNotifications = useCallback((containerList: Container[]) => {
    containerList.forEach(container => {
      // Only check containers that are ready and have injection_status
      if (container.init_status === 'ready' && 
          container.injection_status && 
          !notifiedContainersRef.current.has(container.id)) {
        
        const { failed, warnings } = container.injection_status
        
        // Show warning notification if there are failed configs
        if (failed && failed.length > 0) {
          const failedNames = failed.map(f => f.template_name).join(', ')
          toast.warning(
            `Config Injection Warning: ${container.name}`,
            `${failed.length} configuration(s) failed to inject: ${failedNames}`
          )
        }
        
        // Show info notification for warnings
        if (warnings && warnings.length > 0) {
          toast.info(
            `Config Injection Info: ${container.name}`,
            warnings.join('; ')
          )
        }
        
        // Mark this container as notified
        notifiedContainersRef.current.add(container.id)
      }
    })
  }, [])

  const fetchContainers = useCallback(async () => {
    try {
      const response = await containerApi.list()
      const containerList = response.data
      setContainers(containerList)
      // Check for injection status notifications
      checkInjectionStatusNotifications(containerList)
    } catch {
      console.error('Failed to fetch containers')
    }
  }, [checkInjectionStatusNotifications])

  const fetchRemoteRepos = async (tokenId?: number) => {
    setLoadingRepos(true)
    try {
      const response = await repoApi.listRemote(tokenId)
      setRemoteRepos(response.data || [])
    } catch {
      console.error('Failed to fetch repositories')
    } finally {
      setLoadingRepos(false)
    }
  }

  const fetchConfigProfiles = async () => {
    setLoadingProfiles(true)
    try {
      const [tokensRes, envRes, cmdRes] = await Promise.all([
        configProfileApi.listGitHubTokens(),
        configProfileApi.listEnvProfiles(),
        configProfileApi.listCommandProfiles(),
      ])
      setGithubTokens(tokensRes.data || [])
      setEnvProfiles(envRes.data || [])
      setCommandProfiles(cmdRes.data || [])
    } catch {
      console.error('Failed to fetch config profiles')
    } finally {
      setLoadingProfiles(false)
    }
  }

  const fetchClaudeConfigs = async () => {
    setLoadingClaudeConfigs(true)
    try {
      const response = await claudeConfigApi.list()
      setClaudeConfigs(response.data || [])
    } catch {
      console.error('Failed to fetch Claude configs')
    } finally {
      setLoadingClaudeConfigs(false)
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
    fetchConfigProfiles()
    fetchClaudeConfigs()
  }

  const handleCreate = async () => {
    setCreating(true)
    try {
      let gitRepoUrl = ''
      let gitRepoName = ''

      // Only process repo selection if not skipping git repo
      if (!formData.skipGitRepo) {
        if (repoSource === 'select' && formData.selectedRepo) {
          const selectedRepo = remoteRepos.find(r => r.clone_url === formData.selectedRepo)
          if (selectedRepo) {
            gitRepoUrl = selectedRepo.clone_url
            gitRepoName = selectedRepo.name
          }
        } else if (repoSource === 'url' && formData.gitRepoUrl) {
          gitRepoUrl = formData.gitRepoUrl
        }

        // Require repo URL if not skipping
        if (!gitRepoUrl || !formData.name) {
          return
        }
      } else {
        // When skipping git repo, only name is required
        if (!formData.name) {
          return
        }
      }

      // Build claude config selection
      const claudeConfigSelection: ClaudeConfigSelection = {
        selected_claude_md: formData.selectedClaudeMD,
        selected_skills: formData.selectedSkills,
        selected_mcps: formData.selectedMCPs,
        selected_commands: formData.selectedCommands,
        selected_codex_configs: formData.selectedCodexConfigs,
        selected_codex_auths: formData.selectedCodexAuths,
        selected_gemini_envs: formData.selectedGeminiEnvs,
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
        formData.enableCodeServer,
        formData.githubTokenId,
        formData.envProfileId,
        formData.commandProfileId,
        formData.skipGitRepo,
        formData.enableYoloMode,
        claudeConfigSelection,
        formData.runAsRoot
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
        enableCodeServer: false,
        githubTokenId: undefined,
        envProfileId: undefined,
        commandProfileId: undefined,
        skipGitRepo: false,
        enableYoloMode: false,
        runAsRoot: false,
        selectedClaudeMD: undefined,
        selectedSkills: [],
        selectedMCPs: [],
        selectedCommands: [],
        selectedCodexConfigs: [],
        selectedCodexAuths: [],
        selectedGeminiEnvs: [],
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

  // Render injection status indicator for container card
  const getInjectionStatusDisplay = (container: Container) => {
    const { injection_status } = container
    if (!injection_status) return null

    const { successful, failed, warnings } = injection_status
    const hasFailures = failed && failed.length > 0
    const hasWarnings = warnings && warnings.length > 0
    const hasSuccessful = successful && successful.length > 0

    // Don't show anything if no configs were injected
    if (!hasSuccessful && !hasFailures) return null

    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div 
              className={`flex items-center gap-1 text-xs cursor-help ${
                hasFailures ? 'text-yellow-600 dark:text-yellow-400' : 'text-green-600 dark:text-green-400'
              }`}
              data-testid="injection-status-indicator"
            >
              {hasFailures ? (
                <>
                  <AlertTriangle className="h-3 w-3" />
                  <span>{failed.length} config(s) failed</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-3 w-3" />
                  <span>{successful.length} config(s) injected</span>
                </>
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs" data-testid="injection-status-tooltip">
            <div className="space-y-2">
              {hasSuccessful && (
                <div>
                  <p className="font-medium text-green-600 dark:text-green-400 flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    Successful ({successful.length})
                  </p>
                  <ul className="text-xs text-muted-foreground ml-4 list-disc">
                    {successful.map((name, idx) => (
                      <li key={idx}>{name}</li>
                    ))}
                  </ul>
                </div>
              )}
              {hasFailures && (
                <div>
                  <p className="font-medium text-yellow-600 dark:text-yellow-400 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    Failed ({failed.length})
                  </p>
                  <ul className="text-xs text-muted-foreground ml-4 list-disc">
                    {failed.map((f, idx) => (
                      <li key={idx}>
                        <span className="font-medium">{f.template_name}</span>
                        <span className="text-destructive"> - {f.reason}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {hasWarnings && (
                <div>
                  <p className="font-medium text-blue-600 dark:text-blue-400 flex items-center gap-1">
                    <Info className="h-3 w-3" />
                    Warnings
                  </p>
                  <ul className="text-xs text-muted-foreground ml-4 list-disc">
                    {warnings.map((w, idx) => (
                      <li key={idx}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold">Containers</h1>
          <p className="text-muted-foreground text-sm">Manage your development containers</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchContainers} className="flex-1 md:flex-none">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button size="sm" onClick={handleOpenCreateDialog} className="flex-1 md:flex-none">
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

                {/* Injection Status */}
                {container.init_status === 'ready' && getInjectionStatusDisplay(container)}

                {/* Created Time */}
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {new Date(container.created_at).toLocaleString()}
                </div>

                {/* Actions */}
                <div className="flex flex-wrap items-center gap-2 pt-2 border-t">
                  {container.status === 'running' ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleStop(container.id)}
                      className="min-h-[36px]"
                    >
                      <Square className="h-3 w-3 mr-1" />
                      Stop
                    </Button>
                  ) : container.init_status === 'ready' ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleStart(container.id)}
                      className="min-h-[36px]"
                    >
                      <Play className="h-3 w-3 mr-1" />
                      Start
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" disabled className="min-h-[36px]">
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      Initializing
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleViewLogs(container.id)}
                    className="min-h-[36px]"
                  >
                    <FileText className="h-3 w-3 mr-1" />
                    Logs
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate(`/terminal/${container.id}`)}
                    disabled={container.status !== 'running' || container.init_status !== 'ready'}
                    className="min-h-[36px]"
                  >
                    <Terminal className="h-3 w-3 mr-1" />
                    Terminal
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive min-h-[36px]"
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
        <DialogContent className="w-[95vw] max-w-[550px] max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Create Container</DialogTitle>
            <DialogDescription>
              Create a new development container from a GitHub repository
            </DialogDescription>
          </DialogHeader>
          
          <Tabs defaultValue="basic" className="flex-1">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="basic" className="flex items-center gap-1 text-xs md:text-sm">
                <GitFork className="h-3 w-3" />
                <span className="hidden sm:inline">Basic</span>
              </TabsTrigger>
              <TabsTrigger value="claude" className="flex items-center gap-1 text-xs md:text-sm">
                <FileCode className="h-3 w-3" />
                <span className="hidden sm:inline">Claude</span>
              </TabsTrigger>
              <TabsTrigger value="resources" className="flex items-center gap-1 text-xs md:text-sm">
                <Cpu className="h-3 w-3" />
                <span className="hidden sm:inline">Resources</span>
              </TabsTrigger>
              <TabsTrigger value="network" className="flex items-center gap-1 text-xs md:text-sm">
                <Network className="h-3 w-3" />
                <span className="hidden sm:inline">Network</span>
              </TabsTrigger>
            </TabsList>
            
            {/* Basic Tab */}
            <TabsContent value="basic" className="mt-4">
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
                  
                  {/* Skip GitHub Repository Option */}
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="skipGitRepo"
                      checked={formData.skipGitRepo}
                      onCheckedChange={(checked) =>
                        setFormData({ 
                          ...formData, 
                          skipGitRepo: checked === true,
                          selectedRepo: '',
                          gitRepoUrl: ''
                        })
                      }
                      data-testid="skip-git-repo-checkbox"
                    />
                    <label htmlFor="skipGitRepo" className="text-sm leading-none flex items-center gap-2">
                      <GitFork className="h-4 w-4 text-muted-foreground" />
                      Skip GitHub Repository (create empty container)
                    </label>
                  </div>
                  
                  {/* Repository Selection - only show if not skipping */}
                  {!formData.skipGitRepo && (
                    <>
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
                    </>
                  )}
                  
                  <div className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
                    <p className="font-medium mb-1">What happens next:</p>
                    <ol className="list-decimal list-inside space-y-1 text-xs">
                      <li>Container will be created and started</li>
                      {!formData.skipGitRepo && <li>Repository will be cloned inside</li>}
                      {formData.skipGitRepo && <li>Empty /app directory will be created</li>}
                      {!formData.skipClaudeInit && <li>Claude Code will set up the environment</li>}
                      <li>Once ready, you can access the terminal</li>
                    </ol>
                  </div>
                  
                  {/* Configuration Profiles */}
                  <div className="space-y-3 pt-2 border-t">
                    <Label className="flex items-center gap-2 text-muted-foreground">
                      <Settings2 className="h-4 w-4" />
                      Configuration Profiles
                    </Label>

                    <div className="space-y-2">
                      <Label htmlFor="githubToken" className="text-xs text-muted-foreground">GitHub Token</Label>
                      <Select
                        value={formData.githubTokenId?.toString() || '__none__'}
                        onValueChange={(v) => {
                          const tokenId = v === '__none__' ? undefined : parseInt(v)
                          setFormData({ ...formData, githubTokenId: tokenId, selectedRepo: '' })
                          // Refresh repository list with selected token
                          fetchRemoteRepos(tokenId)
                        }}
                        disabled={loadingProfiles}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={loadingProfiles ? "Loading..." : "Use default"} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Use default</SelectItem>
                          {githubTokens.map((token) => (
                            <SelectItem key={token.id} value={token.id.toString()}>
                              {token.nickname} {token.is_default && "(Default)"}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="envProfile" className="text-xs text-muted-foreground">Environment Variables</Label>
                      <Select
                        value={formData.envProfileId?.toString() || '__none__'}
                        onValueChange={(v) => setFormData({ ...formData, envProfileId: v === '__none__' ? undefined : parseInt(v) })}
                        disabled={loadingProfiles}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={loadingProfiles ? "Loading..." : "None / Use default"} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">None / Use default</SelectItem>
                          {envProfiles.map((profile) => (
                            <SelectItem key={profile.id} value={profile.id.toString()}>
                              {profile.name} {profile.is_default && "(Default)"}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="commandProfile" className="text-xs text-muted-foreground">Startup Command</Label>
                      <Select
                        value={formData.commandProfileId?.toString() || '__none__'}
                        onValueChange={(v) => setFormData({ ...formData, commandProfileId: v === '__none__' ? undefined : parseInt(v) })}
                        disabled={loadingProfiles}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={loadingProfiles ? "Loading..." : "Use default"} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Use default</SelectItem>
                          {commandProfiles.map((profile) => (
                            <SelectItem key={profile.id} value={profile.id.toString()}>
                              {profile.name} {profile.is_default && "(Default)"}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Options */}
                  <div className="space-y-3 pt-2 border-t">
                    <Label className="flex items-center gap-2 text-muted-foreground">
                      <Sparkles className="h-4 w-4" />
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

                    {/* YOLO Mode Option */}
                    <div className="space-y-2">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="enableYoloMode"
                          checked={formData.enableYoloMode}
                          onCheckedChange={(checked) =>
                            setFormData({ ...formData, enableYoloMode: checked === true })
                          }
                          data-testid="yolo-mode-checkbox"
                        />
                        <label htmlFor="enableYoloMode" className="text-sm leading-none flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4 text-yellow-500" />
                          Enable YOLO Mode
                        </label>
                      </div>
                      {formData.enableYoloMode && (
                        <Alert variant="warning" className="mt-2" data-testid="yolo-mode-warning">
                          <AlertTriangle className="h-4 w-4" />
                          <AlertTitle>Warning: YOLO Mode Enabled</AlertTitle>
                          <AlertDescription>
                            YOLO mode (--dangerously-skip-permissions) allows Claude Code to execute commands without permission prompts.
                            This can be dangerous as it bypasses all safety checks. Only enable this if you trust the code being executed.
                          </AlertDescription>
                        </Alert>
                      )}
                    </div>

                    {/* Run As Root Option */}
                    <div className="space-y-2">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="runAsRoot"
                          checked={formData.runAsRoot}
                          onCheckedChange={(checked) =>
                            setFormData({ ...formData, runAsRoot: checked === true })
                          }
                          data-testid="run-as-root-checkbox"
                        />
                        <label htmlFor="runAsRoot" className="text-sm leading-none flex items-center gap-2">
                          <Shield className="h-4 w-4 text-orange-500" />
                          Run as Root User
                        </label>
                      </div>
                      {formData.runAsRoot && (
                        <Alert variant="warning" className="mt-2" data-testid="run-as-root-warning">
                          <Shield className="h-4 w-4" />
                          <AlertTitle>Root Privileges Enabled</AlertTitle>
                          <AlertDescription>
                            Container will run as root user with full system privileges.
                            This grants elevated permissions for system-level operations.
                            Default: runs as 'dev' user with limited permissions.
                          </AlertDescription>
                        </Alert>
                      )}
                    </div>
                  </div>
                </div>
              </ScrollArea>
            </TabsContent>

            {/* Claude Config Tab */}
            <TabsContent value="claude" className="mt-4">
              <ScrollArea className="h-[45vh] pr-4">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <FileCode className="h-4 w-4" />
                      Claude Configuration
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Select configuration templates to inject into the container
                    </p>
                  </div>

                  {loadingClaudeConfigs ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : claudeConfigs.length === 0 ? (
                    <div className="rounded-md bg-muted p-4 text-center text-sm text-muted-foreground">
                      <p>No configuration templates available.</p>
                      <p className="text-xs mt-1">Create templates in the Claude Config page first.</p>
                    </div>
                  ) : (
                    <>
                      {/* CLAUDE.MD Selection (Single Select) */}
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">CLAUDE.MD Template</Label>
                        <p className="text-xs text-muted-foreground">Select one CLAUDE.MD template (optional)</p>
                        <div className="space-y-2 max-h-32 overflow-y-auto border rounded-md p-2">
                          {claudeConfigs
                            .filter(c => c.config_type === ConfigTypes.CLAUDE_MD)
                            .map(config => (
                              <div key={config.id} className="flex items-center space-x-2">
                                <Checkbox
                                  id={`claude-md-${config.id}`}
                                  checked={formData.selectedClaudeMD === config.id}
                                  onCheckedChange={(checked) => {
                                    setFormData({
                                      ...formData,
                                      selectedClaudeMD: checked ? config.id : undefined
                                    })
                                  }}
                                  data-testid={`claude-md-checkbox-${config.id}`}
                                />
                                <ConfigPreview
                                  content={config.content}
                                  configType={config.config_type}
                                  trigger="hover"
                                >
                                  <label
                                    htmlFor={`claude-md-${config.id}`}
                                    className="text-sm cursor-pointer hover:underline"
                                  >
                                    {config.name}
                                    {config.description && (
                                      <span className="text-xs text-muted-foreground ml-2">
                                        - {config.description}
                                      </span>
                                    )}
                                  </label>
                                </ConfigPreview>
                              </div>
                            ))}
                          {claudeConfigs.filter(c => c.config_type === ConfigTypes.CLAUDE_MD).length === 0 && (
                            <p className="text-xs text-muted-foreground">No CLAUDE.MD templates available</p>
                          )}
                        </div>
                      </div>

                      {/* Skills Selection (Multi-Select) */}
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Skills</Label>
                        <p className="text-xs text-muted-foreground">Select multiple skill templates (optional)</p>
                        <div className="space-y-2 max-h-32 overflow-y-auto border rounded-md p-2">
                          {claudeConfigs
                            .filter(c => c.config_type === ConfigTypes.SKILL)
                            .map(config => (
                              <div key={config.id} className="flex items-center space-x-2">
                                <Checkbox
                                  id={`skill-${config.id}`}
                                  checked={formData.selectedSkills.includes(config.id)}
                                  onCheckedChange={(checked) => {
                                    setFormData({
                                      ...formData,
                                      selectedSkills: checked
                                        ? [...formData.selectedSkills, config.id]
                                        : formData.selectedSkills.filter(id => id !== config.id)
                                    })
                                  }}
                                  data-testid={`skill-checkbox-${config.id}`}
                                />
                                <ConfigPreview
                                  content={config.content}
                                  configType={config.config_type}
                                  trigger="hover"
                                >
                                  <label
                                    htmlFor={`skill-${config.id}`}
                                    className="text-sm cursor-pointer hover:underline"
                                  >
                                    {config.name}
                                    {config.description && (
                                      <span className="text-xs text-muted-foreground ml-2">
                                        - {config.description}
                                      </span>
                                    )}
                                  </label>
                                </ConfigPreview>
                              </div>
                            ))}
                          {claudeConfigs.filter(c => c.config_type === ConfigTypes.SKILL).length === 0 && (
                            <p className="text-xs text-muted-foreground">No skill templates available</p>
                          )}
                        </div>
                      </div>

                      {/* MCP Selection (Multi-Select) */}
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">MCP Servers</Label>
                        <p className="text-xs text-muted-foreground">Select multiple MCP server configurations (optional)</p>
                        <div className="space-y-2 max-h-32 overflow-y-auto border rounded-md p-2">
                          {claudeConfigs
                            .filter(c => c.config_type === ConfigTypes.MCP)
                            .map(config => (
                              <div key={config.id} className="flex items-center space-x-2">
                                <Checkbox
                                  id={`mcp-${config.id}`}
                                  checked={formData.selectedMCPs.includes(config.id)}
                                  onCheckedChange={(checked) => {
                                    setFormData({
                                      ...formData,
                                      selectedMCPs: checked
                                        ? [...formData.selectedMCPs, config.id]
                                        : formData.selectedMCPs.filter(id => id !== config.id)
                                    })
                                  }}
                                  data-testid={`mcp-checkbox-${config.id}`}
                                />
                                <ConfigPreview
                                  content={config.content}
                                  configType={config.config_type}
                                  trigger="hover"
                                >
                                  <label
                                    htmlFor={`mcp-${config.id}`}
                                    className="text-sm cursor-pointer hover:underline"
                                  >
                                    {config.name}
                                    {config.description && (
                                      <span className="text-xs text-muted-foreground ml-2">
                                        - {config.description}
                                      </span>
                                    )}
                                  </label>
                                </ConfigPreview>
                              </div>
                            ))}
                          {claudeConfigs.filter(c => c.config_type === ConfigTypes.MCP).length === 0 && (
                            <p className="text-xs text-muted-foreground">No MCP templates available</p>
                          )}
                        </div>
                      </div>

                      {/* Commands Selection (Multi-Select) */}
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Commands</Label>
                        <p className="text-xs text-muted-foreground">Select multiple command templates (optional)</p>
                        <div className="space-y-2 max-h-32 overflow-y-auto border rounded-md p-2">
                          {claudeConfigs
                            .filter(c => c.config_type === ConfigTypes.COMMAND)
                            .map(config => (
                              <div key={config.id} className="flex items-center space-x-2">
                                <Checkbox
                                  id={`command-${config.id}`}
                                  checked={formData.selectedCommands.includes(config.id)}
                                  onCheckedChange={(checked) => {
                                    setFormData({
                                      ...formData,
                                      selectedCommands: checked
                                        ? [...formData.selectedCommands, config.id]
                                        : formData.selectedCommands.filter(id => id !== config.id)
                                    })
                                  }}
                                  data-testid={`command-checkbox-${config.id}`}
                                />
                                <ConfigPreview
                                  content={config.content}
                                  configType={config.config_type}
                                  trigger="hover"
                                >
                                  <label
                                    htmlFor={`command-${config.id}`}
                                    className="text-sm cursor-pointer hover:underline"
                                  >
                                    {config.name}
                                    {config.description && (
                                      <span className="text-xs text-muted-foreground ml-2">
                                        - {config.description}
                                      </span>
                                    )}
                                  </label>
                                </ConfigPreview>
                              </div>
                            ))}
                          {claudeConfigs.filter(c => c.config_type === ConfigTypes.COMMAND).length === 0 && (
                            <p className="text-xs text-muted-foreground">No command templates available</p>
                          )}
                        </div>
                      </div>

                      {/* Codex Config Selection (Multi-Select) */}
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Codex Config</Label>
                        <p className="text-xs text-muted-foreground">Select Codex config.toml templates (optional, writes to ~/.codex/config.toml)</p>
                        <div className="space-y-2 max-h-32 overflow-y-auto border rounded-md p-2">
                          {claudeConfigs
                            .filter(c => c.config_type === ConfigTypes.CODEX_CONFIG)
                            .map(config => (
                              <div key={config.id} className="flex items-center space-x-2">
                                <Checkbox
                                  id={`codex-config-${config.id}`}
                                  checked={formData.selectedCodexConfigs.includes(config.id)}
                                  onCheckedChange={(checked) => {
                                    setFormData({
                                      ...formData,
                                      selectedCodexConfigs: checked
                                        ? [...formData.selectedCodexConfigs, config.id]
                                        : formData.selectedCodexConfigs.filter(id => id !== config.id)
                                    })
                                  }}
                                />
                                <ConfigPreview content={config.content} configType={config.config_type} trigger="hover">
                                  <label htmlFor={`codex-config-${config.id}`} className="text-sm cursor-pointer hover:underline">
                                    {config.name}
                                    {config.description && <span className="text-xs text-muted-foreground ml-2">- {config.description}</span>}
                                  </label>
                                </ConfigPreview>
                              </div>
                            ))}
                          {claudeConfigs.filter(c => c.config_type === ConfigTypes.CODEX_CONFIG).length === 0 && (
                            <p className="text-xs text-muted-foreground">No Codex config templates available</p>
                          )}
                        </div>
                      </div>

                      {/* Codex Auth Selection (Multi-Select) */}
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Codex Auth</Label>
                        <p className="text-xs text-muted-foreground">Select Codex auth.json templates (optional, writes to ~/.codex/auth.json)</p>
                        <div className="space-y-2 max-h-32 overflow-y-auto border rounded-md p-2">
                          {claudeConfigs
                            .filter(c => c.config_type === ConfigTypes.CODEX_AUTH)
                            .map(config => (
                              <div key={config.id} className="flex items-center space-x-2">
                                <Checkbox
                                  id={`codex-auth-${config.id}`}
                                  checked={formData.selectedCodexAuths.includes(config.id)}
                                  onCheckedChange={(checked) => {
                                    setFormData({
                                      ...formData,
                                      selectedCodexAuths: checked
                                        ? [...formData.selectedCodexAuths, config.id]
                                        : formData.selectedCodexAuths.filter(id => id !== config.id)
                                    })
                                  }}
                                />
                                <ConfigPreview content={config.content} configType={config.config_type} trigger="hover">
                                  <label htmlFor={`codex-auth-${config.id}`} className="text-sm cursor-pointer hover:underline">
                                    {config.name}
                                    {config.description && <span className="text-xs text-muted-foreground ml-2">- {config.description}</span>}
                                  </label>
                                </ConfigPreview>
                              </div>
                            ))}
                          {claudeConfigs.filter(c => c.config_type === ConfigTypes.CODEX_AUTH).length === 0 && (
                            <p className="text-xs text-muted-foreground">No Codex auth templates available</p>
                          )}
                        </div>
                      </div>

                      {/* Gemini Env Selection (Multi-Select) */}
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Gemini Environment</Label>
                        <p className="text-xs text-muted-foreground">Select Gemini env var templates (optional, sourced from ~/.bashrc)</p>
                        <div className="space-y-2 max-h-32 overflow-y-auto border rounded-md p-2">
                          {claudeConfigs
                            .filter(c => c.config_type === ConfigTypes.GEMINI_ENV)
                            .map(config => (
                              <div key={config.id} className="flex items-center space-x-2">
                                <Checkbox
                                  id={`gemini-env-${config.id}`}
                                  checked={formData.selectedGeminiEnvs.includes(config.id)}
                                  onCheckedChange={(checked) => {
                                    setFormData({
                                      ...formData,
                                      selectedGeminiEnvs: checked
                                        ? [...formData.selectedGeminiEnvs, config.id]
                                        : formData.selectedGeminiEnvs.filter(id => id !== config.id)
                                    })
                                  }}
                                />
                                <ConfigPreview content={config.content} configType={config.config_type} trigger="hover">
                                  <label htmlFor={`gemini-env-${config.id}`} className="text-sm cursor-pointer hover:underline">
                                    {config.name}
                                    {config.description && <span className="text-xs text-muted-foreground ml-2">- {config.description}</span>}
                                  </label>
                                </ConfigPreview>
                              </div>
                            ))}
                          {claudeConfigs.filter(c => c.config_type === ConfigTypes.GEMINI_ENV).length === 0 && (
                            <p className="text-xs text-muted-foreground">No Gemini env templates available</p>
                          )}
                        </div>
                      </div>
                    </>
                  )}

                  {/* Selection Summary */}
                  {(formData.selectedClaudeMD || formData.selectedSkills.length > 0 || formData.selectedMCPs.length > 0 || formData.selectedCommands.length > 0 || formData.selectedCodexConfigs.length > 0 || formData.selectedCodexAuths.length > 0 || formData.selectedGeminiEnvs.length > 0) && (
                    <div className="rounded-md bg-muted p-3 text-sm">
                      <p className="font-medium mb-2">Selected Configurations:</p>
                      <ul className="list-disc list-inside space-y-1 text-xs text-muted-foreground">
                        {formData.selectedClaudeMD && (
                          <li>CLAUDE.MD: {claudeConfigs.find(c => c.id === formData.selectedClaudeMD)?.name}</li>
                        )}
                        {formData.selectedSkills.length > 0 && (
                          <li>Skills: {formData.selectedSkills.map(id => claudeConfigs.find(c => c.id === id)?.name).join(', ')}</li>
                        )}
                        {formData.selectedMCPs.length > 0 && (
                          <li>MCP Servers: {formData.selectedMCPs.map(id => claudeConfigs.find(c => c.id === id)?.name).join(', ')}</li>
                        )}
                        {formData.selectedCommands.length > 0 && (
                          <li>Commands: {formData.selectedCommands.map(id => claudeConfigs.find(c => c.id === id)?.name).join(', ')}</li>
                        )}
                        {formData.selectedCodexConfigs.length > 0 && (
                          <li>Codex Config: {formData.selectedCodexConfigs.map(id => claudeConfigs.find(c => c.id === id)?.name).join(', ')}</li>
                        )}
                        {formData.selectedCodexAuths.length > 0 && (
                          <li>Codex Auth: {formData.selectedCodexAuths.map(id => claudeConfigs.find(c => c.id === id)?.name).join(', ')}</li>
                        )}
                        {formData.selectedGeminiEnvs.length > 0 && (
                          <li>Gemini Env: {formData.selectedGeminiEnvs.map(id => claudeConfigs.find(c => c.id === id)?.name).join(', ')}</li>
                        )}
                      </ul>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            {/* Resources Tab */}
            <TabsContent value="resources" className="mt-4">
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
            <TabsContent value="network" className="mt-4">
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
