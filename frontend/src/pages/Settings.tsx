import { useState, useEffect } from 'react'
import { CheckCircle2, Loader2, AlertCircle, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { settingsApi } from '@/services/api'

export default function Settings() {
  const [githubToken, setGithubToken] = useState('')
  const [githubConfigured, setGithubConfigured] = useState(false)
  const [customEnvVars, setCustomEnvVars] = useState('')
  const [startupCommand, setStartupCommand] = useState('claude --dangerously-skip-permissions')
  const [loading, setLoading] = useState(true)
  const [savingGithub, setSavingGithub] = useState(false)
  const [savingClaude, setSavingClaude] = useState(false)
  const [githubSuccess, setGithubSuccess] = useState(false)
  const [claudeSuccess, setClaudeSuccess] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const [githubRes, claudeRes] = await Promise.all([
          settingsApi.getGitHubConfig(),
          settingsApi.getClaudeConfig(),
        ])
        setGithubConfigured(githubRes.data.configured)
        setCustomEnvVars(claudeRes.data.custom_env_vars || '')
        setStartupCommand(claudeRes.data.startup_command || 'claude --dangerously-skip-permissions')
      } catch {
        setError('Failed to load settings')
      } finally {
        setLoading(false)
      }
    }
    fetchSettings()
  }, [])

  const handleSaveGithub = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!githubToken.trim()) return
    
    setSavingGithub(true)
    setError('')
    setGithubSuccess(false)
    try {
      await settingsApi.saveGitHubToken(githubToken)
      setGithubConfigured(true)
      setGithubToken('')
      setGithubSuccess(true)
      setTimeout(() => setGithubSuccess(false), 3000)
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } }
      setError(error.response?.data?.error || 'Failed to save GitHub token')
    } finally {
      setSavingGithub(false)
    }
  }

  const handleSaveClaude = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingClaude(true)
    setError('')
    setClaudeSuccess(false)
    try {
      await settingsApi.saveClaudeConfig({
        custom_env_vars: customEnvVars,
        startup_command: startupCommand,
      })
      setClaudeSuccess(true)
      setTimeout(() => setClaudeSuccess(false), 3000)
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } }
      setError(error.response?.data?.error || 'Failed to save configuration')
    } finally {
      setSavingClaude(false)
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
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-muted-foreground">Configure your platform settings</p>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 text-sm text-destructive bg-destructive/10 rounded-md">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      <Tabs defaultValue="github" className="space-y-4">
        <TabsList>
          <TabsTrigger value="github">GitHub</TabsTrigger>
          <TabsTrigger value="environment">Environment Variables</TabsTrigger>
        </TabsList>

        <TabsContent value="github">
          <Card>
            <CardHeader>
              <CardTitle>GitHub Integration</CardTitle>
              <CardDescription>
                Connect your GitHub account to clone repositories
              </CardDescription>
            </CardHeader>
            <CardContent>
              {githubConfigured && (
                <div className="flex items-center gap-2 p-3 mb-4 text-sm text-green-500 bg-green-500/10 rounded-md">
                  <CheckCircle2 className="h-4 w-4" />
                  GitHub token is configured
                </div>
              )}
              <form onSubmit={handleSaveGithub} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="github-token">Personal Access Token</Label>
                  <Input
                    id="github-token"
                    type="password"
                    placeholder="ghp_xxxxxxxxxxxx"
                    value={githubToken}
                    onChange={(e) => setGithubToken(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Create a token at GitHub Settings → Developer settings → Personal access tokens. Required scopes: repo
                  </p>
                </div>
                <Button type="submit" disabled={savingGithub || !githubToken.trim()}>
                  {savingGithub && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {githubSuccess && <CheckCircle2 className="mr-2 h-4 w-4" />}
                  {githubConfigured ? 'Update Token' : 'Save Token'}
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="environment">
          <Card>
            <CardHeader>
              <CardTitle>Environment Variables</CardTitle>
              <CardDescription>
                Configure environment variables for all containers
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-start gap-2 p-3 mb-4 text-sm text-blue-400 bg-blue-500/10 rounded-md">
                <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium">Environment Variables</p>
                  <p className="text-muted-foreground">
                    These variables will be injected into all containers. Include your API keys and other configuration here.
                    Note: Containers must be recreated for new variables to take effect.
                  </p>
                </div>
              </div>
              <form onSubmit={handleSaveClaude} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="env-vars">Environment Variables</Label>
                  <Textarea
                    id="env-vars"
                    rows={10}
                    className="font-mono text-sm"
                    placeholder={`# API Keys
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxx
ANTHROPIC_BASE_URL=http://your-api-url

# Custom Configuration
MY_CUSTOM_VAR=value
DEBUG=true`}
                    value={customEnvVars}
                    onChange={(e) => setCustomEnvVars(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    One per line in VAR_NAME=value format. Do not use quotes around values.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="startup-cmd">Claude Code Startup Command</Label>
                  <Input
                    id="startup-cmd"
                    className="font-mono"
                    placeholder="claude --dangerously-skip-permissions"
                    value={startupCommand}
                    onChange={(e) => setStartupCommand(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Command to run Claude Code for environment initialization
                  </p>
                </div>
                <Button type="submit" disabled={savingClaude}>
                  {savingClaude && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {claudeSuccess && <CheckCircle2 className="mr-2 h-4 w-4" />}
                  Save Configuration
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
