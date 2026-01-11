import { useState, useEffect, useCallback } from 'react'
import { Plus, Pencil, Trash2, Star, Loader2, Info, Key, Terminal, FileCode } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Checkbox } from '@/components/ui/checkbox'
import { configProfileApi, GitHubTokenItem, EnvVarsProfile, StartupCommandProfile } from '@/services/api'
import { toast } from '@/components/ui/toast'

export default function Settings() {
  // GitHub Tokens state
  const [githubTokens, setGithubTokens] = useState<GitHubTokenItem[]>([])
  const [loadingTokens, setLoadingTokens] = useState(true)
  const [tokenDialogOpen, setTokenDialogOpen] = useState(false)
  const [editingToken, setEditingToken] = useState<GitHubTokenItem | null>(null)
  const [tokenForm, setTokenForm] = useState({ nickname: '', remark: '', token: '', is_default: false })
  const [savingToken, setSavingToken] = useState(false)

  // Env Profiles state
  const [envProfiles, setEnvProfiles] = useState<EnvVarsProfile[]>([])
  const [loadingEnv, setLoadingEnv] = useState(true)
  const [envDialogOpen, setEnvDialogOpen] = useState(false)
  const [editingEnv, setEditingEnv] = useState<EnvVarsProfile | null>(null)
  const [envForm, setEnvForm] = useState({ name: '', description: '', env_vars: '', api_url_var_name: '', api_token_var_name: '', is_default: false })
  const [savingEnv, setSavingEnv] = useState(false)

  // Command Profiles state
  const [commandProfiles, setCommandProfiles] = useState<StartupCommandProfile[]>([])
  const [loadingCmd, setLoadingCmd] = useState(true)
  const [cmdDialogOpen, setCmdDialogOpen] = useState(false)
  const [editingCmd, setEditingCmd] = useState<StartupCommandProfile | null>(null)
  const [cmdForm, setCmdForm] = useState({ name: '', description: '', command: 'claude --dangerously-skip-permissions', is_default: false })
  const [savingCmd, setSavingCmd] = useState(false)

  // Load all data
  const loadGitHubTokens = useCallback(async () => {
    setLoadingTokens(true)
    try {
      const res = await configProfileApi.listGitHubTokens()
      setGithubTokens(res.data || [])
    } catch {
      toast.error('Error', 'Failed to load GitHub tokens')
    } finally {
      setLoadingTokens(false)
    }
  }, [])

  const loadEnvProfiles = useCallback(async () => {
    setLoadingEnv(true)
    try {
      const res = await configProfileApi.listEnvProfiles()
      setEnvProfiles(res.data || [])
    } catch {
      toast.error('Error', 'Failed to load environment profiles')
    } finally {
      setLoadingEnv(false)
    }
  }, [])

  const loadCommandProfiles = useCallback(async () => {
    setLoadingCmd(true)
    try {
      const res = await configProfileApi.listCommandProfiles()
      setCommandProfiles(res.data || [])
    } catch {
      toast.error('Error', 'Failed to load command profiles')
    } finally {
      setLoadingCmd(false)
    }
  }, [])

  useEffect(() => {
    loadGitHubTokens()
    loadEnvProfiles()
    loadCommandProfiles()
  }, [loadGitHubTokens, loadEnvProfiles, loadCommandProfiles])

  // GitHub Token handlers
  const handleOpenTokenDialog = (token?: GitHubTokenItem) => {
    if (token) {
      setEditingToken(token)
      setTokenForm({ nickname: token.nickname, remark: token.remark || '', token: '', is_default: token.is_default })
    } else {
      setEditingToken(null)
      setTokenForm({ nickname: '', remark: '', token: '', is_default: false })
    }
    setTokenDialogOpen(true)
  }

  const handleSaveToken = async () => {
    if (!tokenForm.nickname.trim()) {
      toast.error('Error', 'Nickname is required')
      return
    }
    if (!editingToken && !tokenForm.token.trim()) {
      toast.error('Error', 'Token is required')
      return
    }

    setSavingToken(true)
    try {
      if (editingToken) {
        await configProfileApi.updateGitHubToken(editingToken.id, {
          nickname: tokenForm.nickname,
          remark: tokenForm.remark,
          token: tokenForm.token || undefined,
          is_default: tokenForm.is_default,
        })
        toast.success('Success', 'Token updated')
      } else {
        await configProfileApi.createGitHubToken({
          nickname: tokenForm.nickname,
          remark: tokenForm.remark,
          token: tokenForm.token,
          is_default: tokenForm.is_default,
        })
        toast.success('Success', 'Token created')
      }
      setTokenDialogOpen(false)
      loadGitHubTokens()
    } catch {
      toast.error('Error', 'Failed to save token')
    } finally {
      setSavingToken(false)
    }
  }

  const handleDeleteToken = async (id: number) => {
    if (!confirm('Are you sure you want to delete this token?')) return
    try {
      await configProfileApi.deleteGitHubToken(id)
      toast.success('Success', 'Token deleted')
      loadGitHubTokens()
    } catch {
      toast.error('Error', 'Failed to delete token')
    }
  }

  const handleSetDefaultToken = async (id: number) => {
    try {
      await configProfileApi.setDefaultGitHubToken(id)
      toast.success('Success', 'Default token set')
      loadGitHubTokens()
    } catch {
      toast.error('Error', 'Failed to set default')
    }
  }

  // Env Profile handlers
  const handleOpenEnvDialog = (profile?: EnvVarsProfile) => {
    if (profile) {
      setEditingEnv(profile)
      setEnvForm({ 
        name: profile.name, 
        description: profile.description || '', 
        env_vars: profile.env_vars, 
        api_url_var_name: profile.api_url_var_name || '',
        api_token_var_name: profile.api_token_var_name || '',
        is_default: profile.is_default 
      })
    } else {
      setEditingEnv(null)
      setEnvForm({ name: '', description: '', env_vars: '', api_url_var_name: '', api_token_var_name: '', is_default: false })
    }
    setEnvDialogOpen(true)
  }

  const handleSaveEnv = async () => {
    if (!envForm.name.trim()) {
      toast.error('Error', 'Name is required')
      return
    }

    setSavingEnv(true)
    try {
      if (editingEnv) {
        await configProfileApi.updateEnvProfile(editingEnv.id, {
          name: envForm.name,
          description: envForm.description,
          env_vars: envForm.env_vars,
          api_url_var_name: envForm.api_url_var_name || undefined,
          api_token_var_name: envForm.api_token_var_name || undefined,
          is_default: envForm.is_default,
        })
        toast.success('Success', 'Profile updated')
      } else {
        await configProfileApi.createEnvProfile({
          name: envForm.name,
          description: envForm.description,
          env_vars: envForm.env_vars,
          api_url_var_name: envForm.api_url_var_name || undefined,
          api_token_var_name: envForm.api_token_var_name || undefined,
          is_default: envForm.is_default,
        })
        toast.success('Success', 'Profile created')
      }
      setEnvDialogOpen(false)
      loadEnvProfiles()
    } catch {
      toast.error('Error', 'Failed to save profile')
    } finally {
      setSavingEnv(false)
    }
   }

  const handleDeleteEnv = async (id: number) => {
    if (!confirm('Are you sure you want to delete this profile?')) return
    try {
      await configProfileApi.deleteEnvProfile(id)
      toast.success('Success', 'Profile deleted')
      loadEnvProfiles()
    } catch {
      toast.error('Error', 'Failed to delete profile')
    }
  }

  const handleSetDefaultEnv = async (id: number) => {
    try {
      await configProfileApi.setDefaultEnvProfile(id)
      toast.success('Success', 'Default profile set')
      loadEnvProfiles()
    } catch {
      toast.error('Error', 'Failed to set default')
    }
  }

  // Command Profile handlers
  const handleOpenCmdDialog = (profile?: StartupCommandProfile) => {
    if (profile) {
      setEditingCmd(profile)
      setCmdForm({ name: profile.name, description: profile.description || '', command: profile.command, is_default: profile.is_default })
    } else {
      setEditingCmd(null)
      setCmdForm({ name: '', description: '', command: 'claude --dangerously-skip-permissions', is_default: false })
    }
    setCmdDialogOpen(true)
  }

  const handleSaveCmd = async () => {
    if (!cmdForm.name.trim()) {
      toast.error('Error', 'Name is required')
      return
    }
    if (!cmdForm.command.trim()) {
      toast.error('Error', 'Command is required')
      return
    }

    setSavingCmd(true)
    try {
      if (editingCmd) {
        await configProfileApi.updateCommandProfile(editingCmd.id, {
          name: cmdForm.name,
          description: cmdForm.description,
          command: cmdForm.command,
          is_default: cmdForm.is_default,
        })
        toast.success('Success', 'Profile updated')
      } else {
        await configProfileApi.createCommandProfile({
          name: cmdForm.name,
          description: cmdForm.description,
          command: cmdForm.command,
          is_default: cmdForm.is_default,
        })
        toast.success('Success', 'Profile created')
      }
      setCmdDialogOpen(false)
      loadCommandProfiles()
    } catch {
      toast.error('Error', 'Failed to save profile')
    } finally {
      setSavingCmd(false)
    }
  }

  const handleDeleteCmd = async (id: number) => {
    if (!confirm('Are you sure you want to delete this profile?')) return
    try {
      await configProfileApi.deleteCommandProfile(id)
      toast.success('Success', 'Profile deleted')
      loadCommandProfiles()
    } catch {
      toast.error('Error', 'Failed to delete profile')
    }
  }

  const handleSetDefaultCmd = async (id: number) => {
    try {
      await configProfileApi.setDefaultCommandProfile(id)
      toast.success('Success', 'Default profile set')
      loadCommandProfiles()
    } catch {
      toast.error('Error', 'Failed to set default')
    }
  }

  // Count env vars
  const countEnvVars = (envVars: string) => {
    if (!envVars) return 0
    return envVars.split('\n').filter(line => {
      const trimmed = line.trim()
      return trimmed && !trimmed.startsWith('#') && trimmed.includes('=')
    }).length
  }

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-semibold">Settings</h1>
        <p className="text-sm md:text-base text-muted-foreground">Configure your platform settings and profiles</p>
      </div>

      <Tabs defaultValue="github" className="space-y-4">
        <TabsList className="w-full overflow-x-auto flex-nowrap justify-start">
          <TabsTrigger value="github" className="flex items-center gap-1 md:gap-2 text-xs md:text-sm min-h-[44px]">
            <Key className="h-4 w-4" />
            <span className="hidden sm:inline">GitHub</span> Tokens
          </TabsTrigger>
          <TabsTrigger value="environment" className="flex items-center gap-1 md:gap-2 text-xs md:text-sm min-h-[44px]">
            <FileCode className="h-4 w-4" />
            <span className="hidden sm:inline">Environment</span> Vars
          </TabsTrigger>
          <TabsTrigger value="commands" className="flex items-center gap-1 md:gap-2 text-xs md:text-sm min-h-[44px]">
            <Terminal className="h-4 w-4" />
            <span className="hidden sm:inline">Startup</span> Commands
          </TabsTrigger>
        </TabsList>

        {/* GitHub Tokens Tab */}
        <TabsContent value="github">
          <Card>
            <CardHeader className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <CardTitle className="text-base md:text-lg">GitHub Tokens</CardTitle>
                <CardDescription className="text-xs md:text-sm">
                  Manage multiple GitHub personal access tokens for different accounts
                </CardDescription>
              </div>
              <Button onClick={() => handleOpenTokenDialog()} className="w-full md:w-auto min-h-[44px]">
                <Plus className="mr-2 h-4 w-4" />
                Add Token
              </Button>
            </CardHeader>
            <CardContent>
              <div className="flex items-start gap-2 p-3 mb-4 text-sm text-blue-400 bg-blue-500/10 rounded-md">
                <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <div>
                  <p>Create tokens at GitHub Settings → Developer settings → Personal access tokens. Required scopes: repo</p>
                </div>
              </div>
              {loadingTokens ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : githubTokens.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  No tokens configured. Add a GitHub token to clone repositories.
                </div>
              ) : (
                <>
                  {/* Desktop Table */}
                  <div className="hidden md:block">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Nickname</TableHead>
                          <TableHead>Remark</TableHead>
                          <TableHead>Default</TableHead>
                          <TableHead>Created</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {githubTokens.map((token) => (
                          <TableRow key={token.id}>
                            <TableCell className="font-medium">{token.nickname}</TableCell>
                            <TableCell className="text-muted-foreground">{token.remark || '-'}</TableCell>
                            <TableCell>
                              {token.is_default ? (
                                <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                              ) : (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleSetDefaultToken(token.id)}
                                  title="Set as default"
                                >
                                  <Star className="h-4 w-4 text-muted-foreground" />
                                </Button>
                              )}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {token.created_at?.split(' ')[0]}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button variant="ghost" size="sm" onClick={() => handleOpenTokenDialog(token)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => handleDeleteToken(token.id)}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  {/* Mobile Cards */}
                  <div className="md:hidden space-y-3">
                    {githubTokens.map((token) => (
                      <div key={token.id} className="border rounded-lg p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{token.nickname}</span>
                          {token.is_default ? (
                            <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleSetDefaultToken(token.id)}
                              className="min-h-[44px] min-w-[44px]"
                            >
                              <Star className="h-4 w-4 text-muted-foreground" />
                            </Button>
                          )}
                        </div>
                        {token.remark && (
                          <p className="text-sm text-muted-foreground">{token.remark}</p>
                        )}
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">
                            Created: {token.created_at?.split(' ')[0]}
                          </span>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="sm" onClick={() => handleOpenTokenDialog(token)} className="min-h-[44px] min-w-[44px]">
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => handleDeleteToken(token.id)} className="min-h-[44px] min-w-[44px]">
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Environment Variables Tab */}
        <TabsContent value="environment">
          <Card>
            <CardHeader className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <CardTitle className="text-base md:text-lg">Environment Variable Profiles</CardTitle>
                <CardDescription className="text-xs md:text-sm">
                  Create multiple environment variable configurations for different use cases
                </CardDescription>
              </div>
              <Button onClick={() => handleOpenEnvDialog()} className="w-full md:w-auto min-h-[44px]">
                <Plus className="mr-2 h-4 w-4" />
                Add Profile
              </Button>
            </CardHeader>
            <CardContent>
              <div className="flex items-start gap-2 p-3 mb-4 text-sm text-blue-400 bg-blue-500/10 rounded-md">
                <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <div>
                  <p>Environment variables will be injected into containers. Include API keys and configuration here.</p>
                </div>
              </div>
              {loadingEnv ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : envProfiles.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  No profiles configured. Add an environment profile to inject variables into containers.
                </div>
              ) : (
                <>
                  {/* Desktop Table */}
                  <div className="hidden md:block">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead>Variables</TableHead>
                          <TableHead>Default</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {envProfiles.map((profile) => (
                          <TableRow key={profile.id}>
                            <TableCell className="font-medium">{profile.name}</TableCell>
                            <TableCell className="text-muted-foreground">{profile.description || '-'}</TableCell>
                            <TableCell>{countEnvVars(profile.env_vars)} vars</TableCell>
                            <TableCell>
                              {profile.is_default ? (
                                <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                              ) : (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleSetDefaultEnv(profile.id)}
                                  title="Set as default"
                                >
                                  <Star className="h-4 w-4 text-muted-foreground" />
                                </Button>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button variant="ghost" size="sm" onClick={() => handleOpenEnvDialog(profile)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => handleDeleteEnv(profile.id)}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  {/* Mobile Cards */}
                  <div className="md:hidden space-y-3">
                    {envProfiles.map((profile) => (
                      <div key={profile.id} className="border rounded-lg p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{profile.name}</span>
                          {profile.is_default ? (
                            <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleSetDefaultEnv(profile.id)}
                              className="min-h-[44px] min-w-[44px]"
                            >
                              <Star className="h-4 w-4 text-muted-foreground" />
                            </Button>
                          )}
                        </div>
                        {profile.description && (
                          <p className="text-sm text-muted-foreground">{profile.description}</p>
                        )}
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">
                            {countEnvVars(profile.env_vars)} variables
                          </span>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="sm" onClick={() => handleOpenEnvDialog(profile)} className="min-h-[44px] min-w-[44px]">
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => handleDeleteEnv(profile.id)} className="min-h-[44px] min-w-[44px]">
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Startup Commands Tab */}
        <TabsContent value="commands">
          <Card>
            <CardHeader className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <CardTitle className="text-base md:text-lg">Startup Command Profiles</CardTitle>
                <CardDescription className="text-xs md:text-sm">
                  Configure different Claude Code startup commands for different scenarios
                </CardDescription>
              </div>
              <Button onClick={() => handleOpenCmdDialog()} className="w-full md:w-auto min-h-[44px]">
                <Plus className="mr-2 h-4 w-4" />
                Add Profile
              </Button>
            </CardHeader>
            <CardContent>
              <div className="flex items-start gap-2 p-3 mb-4 text-sm text-blue-400 bg-blue-500/10 rounded-md">
                <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <div>
                  <p>The startup command is used to initialize Claude Code environment in containers.</p>
                </div>
              </div>
              {loadingCmd ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : commandProfiles.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  No profiles configured. Default command will be used: claude --dangerously-skip-permissions
                </div>
              ) : (
                <>
                  {/* Desktop Table */}
                  <div className="hidden md:block">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead>Command</TableHead>
                          <TableHead>Default</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {commandProfiles.map((profile) => (
                          <TableRow key={profile.id}>
                            <TableCell className="font-medium">{profile.name}</TableCell>
                            <TableCell className="text-muted-foreground">{profile.description || '-'}</TableCell>
                            <TableCell className="font-mono text-sm max-w-[300px] truncate" title={profile.command}>
                              {profile.command}
                            </TableCell>
                            <TableCell>
                              {profile.is_default ? (
                                <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                              ) : (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleSetDefaultCmd(profile.id)}
                                  title="Set as default"
                                >
                                  <Star className="h-4 w-4 text-muted-foreground" />
                                </Button>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button variant="ghost" size="sm" onClick={() => handleOpenCmdDialog(profile)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => handleDeleteCmd(profile.id)}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  {/* Mobile Cards */}
                  <div className="md:hidden space-y-3">
                    {commandProfiles.map((profile) => (
                      <div key={profile.id} className="border rounded-lg p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{profile.name}</span>
                          {profile.is_default ? (
                            <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleSetDefaultCmd(profile.id)}
                              className="min-h-[44px] min-w-[44px]"
                            >
                              <Star className="h-4 w-4 text-muted-foreground" />
                            </Button>
                          )}
                        </div>
                        {profile.description && (
                          <p className="text-sm text-muted-foreground">{profile.description}</p>
                        )}
                        <div className="font-mono text-xs bg-muted p-2 rounded break-all">
                          {profile.command}
                        </div>
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => handleOpenCmdDialog(profile)} className="min-h-[44px] min-w-[44px]">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => handleDeleteCmd(profile.id)} className="min-h-[44px] min-w-[44px]">
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* GitHub Token Dialog */}
      <Dialog open={tokenDialogOpen} onOpenChange={setTokenDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingToken ? 'Edit GitHub Token' : 'Add GitHub Token'}</DialogTitle>
            <DialogDescription>
              {editingToken ? 'Update the token details. Leave token field empty to keep existing.' : 'Add a new GitHub personal access token.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="token-nickname">Nickname *</Label>
              <Input
                id="token-nickname"
                placeholder="e.g., Work Account"
                value={tokenForm.nickname}
                onChange={(e) => setTokenForm({ ...tokenForm, nickname: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="token-remark">Remark</Label>
              <Input
                id="token-remark"
                placeholder="Optional description"
                value={tokenForm.remark}
                onChange={(e) => setTokenForm({ ...tokenForm, remark: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="token-value">Token {!editingToken && '*'}</Label>
              <Input
                id="token-value"
                type="password"
                placeholder={editingToken ? 'Leave empty to keep existing' : 'ghp_xxxxxxxxxxxx'}
                value={tokenForm.token}
                onChange={(e) => setTokenForm({ ...tokenForm, token: e.target.value })}
              />
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="token-default"
                checked={tokenForm.is_default}
                onCheckedChange={(checked) => setTokenForm({ ...tokenForm, is_default: checked as boolean })}
              />
              <Label htmlFor="token-default">Set as default token</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTokenDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveToken} disabled={savingToken}>
              {savingToken && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Env Profile Dialog */}
      <Dialog open={envDialogOpen} onOpenChange={setEnvDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingEnv ? 'Edit Environment Profile' : 'Add Environment Profile'}</DialogTitle>
            <DialogDescription>
              Configure environment variables for this profile.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="env-name">Name *</Label>
                <Input
                  id="env-name"
                  placeholder="e.g., Development"
                  value={envForm.name}
                  onChange={(e) => setEnvForm({ ...envForm, name: e.target.value })}
                  className="min-h-[44px]"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="env-description">Description</Label>
                <Input
                  id="env-description"
                  placeholder="Optional description"
                  value={envForm.description}
                  onChange={(e) => setEnvForm({ ...envForm, description: e.target.value })}
                  className="min-h-[44px]"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="env-vars">Environment Variables</Label>
              <Textarea
                id="env-vars"
                rows={8}
                className="font-mono text-sm"
                placeholder={`# API Keys
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxx
ANTHROPIC_BASE_URL=http://your-api-url

# Custom Configuration
MY_CUSTOM_VAR=value
DEBUG=true`}
                value={envForm.env_vars}
                onChange={(e) => setEnvForm({ ...envForm, env_vars: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                One per line in VAR_NAME=value format. Lines starting with # are comments.
              </p>
            </div>
            {/* API Config Variable Names */}
            <div className="border rounded-md p-3 space-y-3 bg-muted/30">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Info className="h-4 w-4 text-blue-400" />
                <span>API Configuration (for Headless model selection)</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Specify which environment variable names contain the API URL and Token. 
                This allows Headless mode to fetch available models from your API endpoint.
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="env-api-url-var">API URL Variable Name</Label>
                  <Input
                    id="env-api-url-var"
                    placeholder="e.g., ANTHROPIC_BASE_URL"
                    value={envForm.api_url_var_name}
                    onChange={(e) => setEnvForm({ ...envForm, api_url_var_name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="env-api-token-var">API Token Variable Name</Label>
                  <Input
                    id="env-api-token-var"
                    placeholder="e.g., ANTHROPIC_API_KEY"
                    value={envForm.api_token_var_name}
                    onChange={(e) => setEnvForm({ ...envForm, api_token_var_name: e.target.value })}
                  />
                </div>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="env-default"
                checked={envForm.is_default}
                onCheckedChange={(checked) => setEnvForm({ ...envForm, is_default: checked as boolean })}
              />
              <Label htmlFor="env-default">Set as default profile</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEnvDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveEnv} disabled={savingEnv}>
              {savingEnv && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Command Profile Dialog */}
      <Dialog open={cmdDialogOpen} onOpenChange={setCmdDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingCmd ? 'Edit Command Profile' : 'Add Command Profile'}</DialogTitle>
            <DialogDescription>
              Configure the Claude Code startup command.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="cmd-name">Name *</Label>
              <Input
                id="cmd-name"
                placeholder="e.g., Standard"
                value={cmdForm.name}
                onChange={(e) => setCmdForm({ ...cmdForm, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cmd-description">Description</Label>
              <Input
                id="cmd-description"
                placeholder="Optional description"
                value={cmdForm.description}
                onChange={(e) => setCmdForm({ ...cmdForm, description: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cmd-command">Command *</Label>
              <Input
                id="cmd-command"
                className="font-mono"
                placeholder="claude --dangerously-skip-permissions"
                value={cmdForm.command}
                onChange={(e) => setCmdForm({ ...cmdForm, command: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Command to run Claude Code for environment initialization.
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="cmd-default"
                checked={cmdForm.is_default}
                onCheckedChange={(checked) => setCmdForm({ ...cmdForm, is_default: checked as boolean })}
              />
              <Label htmlFor="cmd-default">Set as default profile</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCmdDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveCmd} disabled={savingCmd}>
              {savingCmd && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
