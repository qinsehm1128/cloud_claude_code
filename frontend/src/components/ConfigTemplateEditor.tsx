import { useState, useRef, useCallback, useEffect } from 'react'
import { Upload, Loader2, FileCode, FileJson, FolderArchive, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { ClaudeConfigTemplate, ConfigType, CreateConfigInput } from '@/types/claudeConfig'
import { ConfigTypes } from '@/types/claudeConfig'

export interface ConfigTemplateEditorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  template?: ClaudeConfigTemplate | null // null for create, template for edit
  configType: ConfigType
  onSave: (data: CreateConfigInput) => Promise<void>
}

// Validation error interface
interface ValidationErrors {
  name?: string
  content?: string
  archive?: string
}

// Get syntax type based on config type
const getSyntaxType = (configType: ConfigType): 'markdown' | 'json' => {
  if (configType === ConfigTypes.MCP || configType === ConfigTypes.CODEX_AUTH) return 'json'
  return 'markdown'
}

// Get accepted file extensions based on config type
const getAcceptedFileTypes = (configType: ConfigType): string => {
  if (configType === ConfigTypes.MCP || configType === ConfigTypes.CODEX_AUTH) return '.json'
  if (configType === ConfigTypes.CODEX_CONFIG) return '.toml'
  return '.md'
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
      return 'model_provider = "sub2api"\nmodel = "gpt-5.2-codex"\nmodel_reasoning_effort = "high"\nnetwork_access = "enabled"\ndisable_response_storage = true\n\n[model_providers.sub2api]\nname = "sub2api"\nbase_url = "http://your-api-url"\nwire_api = "responses"\nrequires_openai_auth = true'
    case ConfigTypes.CODEX_AUTH:
      return '{\n  "OPENAI_API_KEY": "sk-your-api-key-here"\n}'
    case ConfigTypes.GEMINI_ENV:
      return 'GOOGLE_GEMINI_BASE_URL=http://your-api-url\nGEMINI_API_KEY=sk-your-api-key-here\nGEMINI_MODEL=gemini-3-pro-preview'
    default:
      return ''
  }
}

// Get config type display name
const getConfigTypeDisplayName = (configType: ConfigType): string => {
  switch (configType) {
    case ConfigTypes.CLAUDE_MD:
      return 'CLAUDE.MD'
    case ConfigTypes.SKILL:
      return 'Skill'
    case ConfigTypes.MCP:
      return 'MCP'
    case ConfigTypes.COMMAND:
      return 'Command'
    case ConfigTypes.CODEX_CONFIG:
      return 'Codex Config'
    case ConfigTypes.CODEX_AUTH:
      return 'Codex Auth'
    case ConfigTypes.GEMINI_ENV:
      return 'Gemini Env'
    default:
      return configType
  }
}

// Validate file type based on config type
export const validateFileType = (file: File, configType: ConfigType): boolean => {
  const fileName = file.name.toLowerCase()
  if (configType === ConfigTypes.MCP || configType === ConfigTypes.CODEX_AUTH) {
    return fileName.endsWith('.json')
  }
  if (configType === ConfigTypes.CODEX_CONFIG) {
    return fileName.endsWith('.toml')
  }
  if (configType === ConfigTypes.GEMINI_ENV) {
    return fileName.endsWith('.env') || fileName.endsWith('.txt') || fileName.endsWith('.sh')
  }
  return fileName.endsWith('.md')
}

// Validate MCP JSON content
const validateMCPContent = (content: string): string | null => {
  if (!content.trim()) {
    return null // Empty content is handled by required validation
  }
  try {
    const parsed = JSON.parse(content)
    if (typeof parsed !== 'object' || parsed === null) {
      return 'Content must be a valid JSON object'
    }
    if (!parsed.command || typeof parsed.command !== 'string') {
      return 'MCP configuration must have a "command" field (string)'
    }
    if (!parsed.args || !Array.isArray(parsed.args)) {
      return 'MCP configuration must have an "args" field (array)'
    }
    return null
  } catch {
    return 'Invalid JSON format'
  }
}

export default function ConfigTemplateEditor({
  open,
  onOpenChange,
  template,
  configType,
  onSave,
}: ConfigTemplateEditorProps) {
  const [formData, setFormData] = useState<CreateConfigInput>({
    name: '',
    config_type: configType,
    content: '',
    description: '',
    is_archive: false,
    archive_data: '',
  })
  const [errors, setErrors] = useState<ValidationErrors>({})
  const [saving, setSaving] = useState(false)
  const [fileError, setFileError] = useState<string | null>(null)
  const [archiveFileName, setArchiveFileName] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const archiveInputRef = useRef<HTMLInputElement>(null)

  const isEditing = !!template
  const syntaxType = getSyntaxType(configType)

  // Reset form when dialog opens or template changes
  useEffect(() => {
    if (open) {
      if (template) {
        setFormData({
          name: template.name,
          config_type: template.config_type,
          content: template.content,
          description: template.description || '',
          is_archive: template.is_archive || false,
          archive_data: template.archive_data || '',
        })
        setArchiveFileName(template.is_archive ? 'Uploaded archive' : null)
      } else {
        setFormData({
          name: '',
          config_type: configType,
          content: '',
          description: '',
          is_archive: false,
          archive_data: '',
        })
        setArchiveFileName(null)
      }
      setErrors({})
      setFileError(null)
    }
  }, [open, template, configType])

  // Validate form
  const validateForm = useCallback((): boolean => {
    const newErrors: ValidationErrors = {}

    if (!formData.name.trim()) {
      newErrors.name = 'Name is required'
    }

    // For archive-based skills, archive_data is required instead of content
    if (formData.is_archive && configType === ConfigTypes.SKILL) {
      if (!formData.archive_data) {
        newErrors.archive = 'Please upload a zip file containing the skill folder'
      }
    } else {
      if (!formData.content.trim()) {
        newErrors.content = 'Content is required'
      } else if (configType === ConfigTypes.MCP) {
        const mcpError = validateMCPContent(formData.content)
        if (mcpError) {
          newErrors.content = mcpError
        }
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }, [formData, configType])

  // Handle save
  const handleSave = async () => {
    if (!validateForm()) {
      return
    }

    setSaving(true)
    try {
      await onSave(formData)
      onOpenChange(false)
    } catch {
      // Error handling is done by the parent component
    } finally {
      setSaving(false)
    }
  }

  // Handle file upload
  const handleFileUpload = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      if (!file) return

      setFileError(null)

      // Validate file type
      if (!validateFileType(file, configType)) {
        const expectedType = configType === ConfigTypes.MCP ? '.json' : '.md'
        setFileError(`Invalid file type. Expected ${expectedType} file.`)
        // Reset file input
        if (fileInputRef.current) {
          fileInputRef.current.value = ''
        }
        return
      }

      // Read file content
      const reader = new FileReader()
      reader.onload = (e) => {
        const content = e.target?.result as string
        
        // For MCP files, validate JSON format
        if (configType === ConfigTypes.MCP) {
          const mcpError = validateMCPContent(content)
          if (mcpError) {
            setFileError(`File content error: ${mcpError}`)
            if (fileInputRef.current) {
              fileInputRef.current.value = ''
            }
            return
          }
        }

        // Update form with file content
        setFormData((prev) => ({
          ...prev,
          content,
          // Use filename without extension as name if name is empty
          name: prev.name || file.name.replace(/\.(md|json)$/i, ''),
        }))
        
        // Clear content error if any
        setErrors((prev) => ({ ...prev, content: undefined }))
      }
      reader.onerror = () => {
        setFileError('Failed to read file')
      }
      reader.readAsText(file)

      // Reset file input for re-upload
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    },
    [configType]
  )

  // Handle upload button click
  const handleUploadClick = () => {
    fileInputRef.current?.click()
  }

  // Handle archive (zip) file upload
  const handleArchiveUpload = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      if (!file) return

      setFileError(null)

      // Validate file type (must be .zip)
      if (!file.name.toLowerCase().endsWith('.zip')) {
        setFileError('Please upload a .zip file containing the skill folder')
        if (archiveInputRef.current) {
          archiveInputRef.current.value = ''
        }
        return
      }

      // Read file as base64
      const reader = new FileReader()
      reader.onload = (e) => {
        const arrayBuffer = e.target?.result as ArrayBuffer
        const bytes = new Uint8Array(arrayBuffer)
        let binary = ''
        bytes.forEach((byte) => {
          binary += String.fromCharCode(byte)
        })
        const base64 = btoa(binary)

        setFormData((prev) => ({
          ...prev,
          archive_data: base64,
          // Use filename without extension as name if name is empty
          name: prev.name || file.name.replace(/\.zip$/i, ''),
        }))
        setArchiveFileName(file.name)
        setErrors((prev) => ({ ...prev, archive: undefined }))
      }
      reader.onerror = () => {
        setFileError('Failed to read zip file')
      }
      reader.readAsArrayBuffer(file)

      // Reset file input for re-upload
      if (archiveInputRef.current) {
        archiveInputRef.current.value = ''
      }
    },
    []
  )

  // Handle archive upload button click
  const handleArchiveUploadClick = () => {
    archiveInputRef.current?.click()
  }

  // Check if archive mode is available (only for SKILL type)
  const canUseArchiveMode = configType === ConfigTypes.SKILL

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? 'Edit Template' : 'Create Template'}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? `Update the ${getConfigTypeDisplayName(configType)} template`
              : `Create a new ${getConfigTypeDisplayName(configType)} template`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Name field */}
          <div className="space-y-2">
            <Label htmlFor="template-name">Name</Label>
            <Input
              id="template-name"
              value={formData.name}
              onChange={(e) => {
                setFormData({ ...formData, name: e.target.value })
                if (errors.name) {
                  setErrors({ ...errors, name: undefined })
                }
              }}
              placeholder="Template name"
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? 'name-error' : undefined}
            />
            {errors.name && (
              <p id="name-error" className="text-sm text-destructive">
                {errors.name}
              </p>
            )}
          </div>

          {/* Description field */}
          <div className="space-y-2">
            <Label htmlFor="template-description">Description (optional)</Label>
            <Input
              id="template-description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Brief description of this template"
            />
          </div>

          {/* Archive mode toggle (only for SKILL type) */}
          {canUseArchiveMode && (
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="archive-mode"
                  checked={formData.is_archive}
                  onCheckedChange={(checked) => {
                    setFormData({
                      ...formData,
                      is_archive: checked === true,
                      // Clear content/archive when switching modes
                      content: checked ? '' : formData.content,
                      archive_data: checked ? formData.archive_data : '',
                    })
                    setArchiveFileName(checked ? archiveFileName : null)
                    setErrors({})
                    setFileError(null)
                  }}
                />
                <Label
                  htmlFor="archive-mode"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Multi-file skill (upload zip archive)
                </Label>
              </div>
              <Alert variant="default" className="bg-muted/50">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  Enable this option to upload a zip file containing the complete skill folder structure
                  (SKILL.md + scripts, resources, etc.)
                </AlertDescription>
              </Alert>
            </div>
          )}

          {/* Archive upload section (when archive mode is enabled) */}
          {formData.is_archive && canUseArchiveMode && (
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                Skill Archive
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-muted text-muted-foreground">
                  <FolderArchive className="h-3 w-3" />
                  ZIP
                </span>
              </Label>
              <div className="border rounded-md p-4 bg-muted/30">
                <input
                  ref={archiveInputRef}
                  type="file"
                  accept=".zip"
                  onChange={handleArchiveUpload}
                  className="hidden"
                  aria-label="Upload zip archive"
                />
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    {archiveFileName ? (
                      <div className="flex items-center gap-2 text-sm">
                        <FolderArchive className="h-4 w-4 text-green-500" />
                        <span>{archiveFileName}</span>
                        <span className="text-muted-foreground">
                          ({Math.round((formData.archive_data?.length || 0) * 0.75 / 1024)} KB)
                        </span>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        No archive uploaded. Please upload a .zip file.
                      </p>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleArchiveUploadClick}
                  >
                    <Upload className="h-4 w-4 mr-1" />
                    {archiveFileName ? 'Change' : 'Upload ZIP'}
                  </Button>
                </div>
              </div>
              {errors.archive && (
                <p className="text-sm text-destructive">{errors.archive}</p>
              )}
              {fileError && (
                <p className="text-sm text-destructive">{fileError}</p>
              )}
            </div>
          )}

          {/* Content field with syntax indicator and upload (when not in archive mode) */}
          {(!formData.is_archive || !canUseArchiveMode) && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="template-content" className="flex items-center gap-2">
                Content
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-muted text-muted-foreground"
                  data-testid="syntax-indicator"
                >
                  {syntaxType === 'json' ? (
                    <>
                      <FileJson className="h-3 w-3" />
                      JSON
                    </>
                  ) : (
                    <>
                      <FileCode className="h-3 w-3" />
                      Markdown
                    </>
                  )}
                </span>
              </Label>
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={getAcceptedFileTypes(configType)}
                  onChange={handleFileUpload}
                  className="hidden"
                  aria-label="Upload file"
                  data-testid="file-input"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleUploadClick}
                  data-testid="upload-button"
                >
                  <Upload className="h-4 w-4 mr-1" />
                  Upload
                </Button>
              </div>
            </div>
            
            {fileError && (
              <p className="text-sm text-destructive" data-testid="file-error">
                {fileError}
              </p>
            )}

            <Textarea
              id="template-content"
              value={formData.content}
              onChange={(e) => {
                setFormData({ ...formData, content: e.target.value })
                if (errors.content) {
                  setErrors({ ...errors, content: undefined })
                }
              }}
              placeholder={getContentPlaceholder(configType)}
              className="min-h-[300px] font-mono text-sm"
              aria-invalid={!!errors.content}
              aria-describedby={errors.content ? 'content-error' : undefined}
              data-testid="content-editor"
              data-syntax={syntaxType}
            />
            {errors.content && (
              <p id="content-error" className="text-sm text-destructive" data-testid="content-error">
                {errors.content}
              </p>
            )}
          </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving} data-testid="save-button">
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEditing ? 'Update' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
