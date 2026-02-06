import { useState, useEffect, useCallback } from 'react'
import { Plus, Pencil, Trash2, Loader2, FileText, Wrench, Server, Terminal, Code, Key, Globe } from 'lucide-react'
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
import { claudeConfigApi } from '@/services/claudeConfigApi'
import { toast } from '@/components/ui/toast'
import type { ClaudeConfigTemplate, ConfigType, CreateConfigInput } from '@/types/claudeConfig'
import { ConfigTypes } from '@/types/claudeConfig'

// Tab configuration
const tabConfig = [
  { value: 'claude_md', label: 'CLAUDE.MD', type: ConfigTypes.CLAUDE_MD, icon: FileText },
  { value: 'skill', label: 'Skills', type: ConfigTypes.SKILL, icon: Wrench },
  { value: 'mcp', label: 'MCP', type: ConfigTypes.MCP, icon: Server },
  { value: 'command', label: 'Commands', type: ConfigTypes.COMMAND, icon: Terminal },
  { value: 'codex_config', label: 'Codex Config', type: ConfigTypes.CODEX_CONFIG, icon: Code },
  { value: 'codex_auth', label: 'Codex Auth', type: ConfigTypes.CODEX_AUTH, icon: Key },
  { value: 'gemini_env', label: 'Gemini Env', type: ConfigTypes.GEMINI_ENV, icon: Globe },
]

export default function ClaudeConfig() {
  // Templates state for each config type
  const [templates, setTemplates] = useState<Record<ConfigType, ClaudeConfigTemplate[]>>({
    CLAUDE_MD: [],
    SKILL: [],
    MCP: [],
    COMMAND: [],
    CODEX_CONFIG: [],
    CODEX_AUTH: [],
    GEMINI_ENV: [],
  })
  const [loading, setLoading] = useState<Record<ConfigType, boolean>>({
    CLAUDE_MD: true,
    SKILL: true,
    MCP: true,
    COMMAND: true,
    CODEX_CONFIG: true,
    CODEX_AUTH: true,
    GEMINI_ENV: true,
  })

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<ClaudeConfigTemplate | null>(null)
  const [currentConfigType, setCurrentConfigType] = useState<ConfigType>(ConfigTypes.CLAUDE_MD)
  const [formData, setFormData] = useState<CreateConfigInput>({
    name: '',
    config_type: ConfigTypes.CLAUDE_MD,
    content: '',
    description: '',
  })
  const [saving, setSaving] = useState(false)

  // Delete confirmation state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [templateToDelete, setTemplateToDelete] = useState<ClaudeConfigTemplate | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Load templates for a specific config type
  const loadTemplates = useCallback(async (configType: ConfigType) => {
    setLoading(prev => ({ ...prev, [configType]: true }))
    try {
      const res = await claudeConfigApi.list(configType)
      setTemplates(prev => ({ ...prev, [configType]: res.data || [] }))
    } catch {
      toast.error('Error', `Failed to load ${configType} templates`)
    } finally {
      setLoading(prev => ({ ...prev, [configType]: false }))
    }
  }, [])

  // Load all templates on mount
  useEffect(() => {
    tabConfig.forEach(tab => loadTemplates(tab.type))
  }, [loadTemplates])

  // Open dialog for create
  const handleCreate = (configType: ConfigType) => {
    setEditingTemplate(null)
    setCurrentConfigType(configType)
    setFormData({
      name: '',
      config_type: configType,
      content: '',
      description: '',
    })
    setDialogOpen(true)
  }

  // Open dialog for edit
  const handleEdit = (template: ClaudeConfigTemplate) => {
    setEditingTemplate(template)
    setCurrentConfigType(template.config_type)
    setFormData({
      name: template.name,
      config_type: template.config_type,
      content: template.content,
      description: template.description || '',
    })
    setDialogOpen(true)
  }

  // Open delete confirmation
  const handleDeleteClick = (template: ClaudeConfigTemplate) => {
    setTemplateToDelete(template)
    setDeleteDialogOpen(true)
  }

  // Confirm delete
  const handleDeleteConfirm = async () => {
    if (!templateToDelete) return

    setDeleting(true)
    try {
      await claudeConfigApi.delete(templateToDelete.id)
      toast.success('Success', 'Template deleted')
      loadTemplates(templateToDelete.config_type)
      setDeleteDialogOpen(false)
      setTemplateToDelete(null)
    } catch {
      toast.error('Error', 'Failed to delete template')
    } finally {
      setDeleting(false)
    }
  }

  // Save template (create or update)
  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error('Error', 'Name is required')
      return
    }
    if (!formData.content.trim()) {
      toast.error('Error', 'Content is required')
      return
    }

    setSaving(true)
    try {
      if (editingTemplate) {
        await claudeConfigApi.update(editingTemplate.id, formData)
        toast.success('Success', 'Template updated')
      } else {
        await claudeConfigApi.create(formData)
        toast.success('Success', 'Template created')
      }
      setDialogOpen(false)
      loadTemplates(currentConfigType)
    } catch {
      toast.error('Error', 'Failed to save template')
    } finally {
      setSaving(false)
    }
  }

  // Get placeholder text based on config type
  const getContentPlaceholder = (configType: ConfigType): string => {
    switch (configType) {
      case ConfigTypes.CLAUDE_MD:
        return '# Project Overview\n\nDescribe your project here...'
      case ConfigTypes.SKILL:
        return '---\nallowed_tools:\n  - Read\n  - Write\n---\n\n# Skill Name\n\nDescribe the skill...'
      case ConfigTypes.MCP:
        return '{\n  "command": "npx",\n  "args": ["-y", "@modelcontextprotocol/server-example"]\n}'
      case ConfigTypes.COMMAND:
        return '# Command Name\n\nDescribe what this command does...'
      case ConfigTypes.CODEX_CONFIG:
        return 'model_provider = "sub2api"\nmodel = "gpt-5.2-codex"\nmodel_reasoning_effort = "high"\nnetwork_access = "enabled"\ndisable_response_storage = true\nwindows_wsl_setup_acknowledged = true\nmodel_verbosity = "high"\n\n[model_providers.sub2api]\nname = "sub2api"\nbase_url = "http://your-api-url"\nwire_api = "responses"\nrequires_openai_auth = true'
      case ConfigTypes.CODEX_AUTH:
        return '{\n  "OPENAI_API_KEY": "sk-your-api-key-here"\n}'
      case ConfigTypes.GEMINI_ENV:
        return 'GOOGLE_GEMINI_BASE_URL=http://your-api-url\nGEMINI_API_KEY=sk-your-api-key-here\nGEMINI_MODEL=gemini-3-pro-preview'
      default:
        return ''
    }
  }

  // Render template list for a config type
  const renderTemplateList = (configType: ConfigType) => {
    const typeTemplates = templates[configType]
    const isLoading = loading[configType]
    const tabInfo = tabConfig.find(t => t.type === configType)

    return (
      <Card>
        <CardHeader className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <CardTitle className="text-base md:text-lg">{tabInfo?.label} Templates</CardTitle>
            <CardDescription className="text-xs md:text-sm">
              Manage your {tabInfo?.label.toLowerCase()} configuration templates
            </CardDescription>
          </div>
          <Button onClick={() => handleCreate(configType)} className="w-full md:w-auto min-h-[44px]">
            <Plus className="mr-2 h-4 w-4" />
            Create Template
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : typeTemplates.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No {tabInfo?.label.toLowerCase()} templates configured. Create one to get started.
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
                      <TableHead>Created</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {typeTemplates.map((template) => (
                      <TableRow key={template.id}>
                        <TableCell className="font-medium">{template.name}</TableCell>
                        <TableCell className="text-muted-foreground max-w-[300px] truncate">
                          {template.description || '-'}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {template.created_at?.split('T')[0]}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" onClick={() => handleEdit(template)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => handleDeleteClick(template)}>
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
                {typeTemplates.map((template) => (
                  <div key={template.id} className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{template.name}</span>
                    </div>
                    {template.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2">{template.description}</p>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        Created: {template.created_at?.split('T')[0]}
                      </span>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => handleEdit(template)} className="min-h-[44px] min-w-[44px]">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDeleteClick(template)} className="min-h-[44px] min-w-[44px]">
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
    )
  }

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-semibold">CLI Config</h1>
        <p className="text-sm md:text-base text-muted-foreground">
          Manage Claude, Codex, and Gemini CLI configuration templates
        </p>
      </div>

      <Tabs defaultValue="claude_md" className="space-y-4">
        <TabsList className="w-full overflow-x-auto flex-nowrap justify-start">
          {tabConfig.map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className="flex items-center gap-1 md:gap-2 text-xs md:text-sm min-h-[44px]"
            >
              <tab.icon className="h-4 w-4" />
              <span className="hidden sm:inline">{tab.label}</span>
              <span className="sm:hidden">{tab.label.split('.')[0]}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        {tabConfig.map((tab) => (
          <TabsContent key={tab.value} value={tab.value}>
            {renderTemplateList(tab.type)}
          </TabsContent>
        ))}
      </Tabs>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingTemplate ? 'Edit Template' : 'Create Template'}
            </DialogTitle>
            <DialogDescription>
              {editingTemplate
                ? `Update the ${currentConfigType.toLowerCase().replace('_', ' ')} template`
                : `Create a new ${currentConfigType.toLowerCase().replace('_', ' ')} template`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Template name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Input
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Brief description of this template"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="content">Content</Label>
              <Textarea
                id="content"
                value={formData.content}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                placeholder={getContentPlaceholder(currentConfigType)}
                className="min-h-[300px] font-mono text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingTemplate ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Template</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{templateToDelete?.name}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteConfirm} disabled={deleting}>
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
