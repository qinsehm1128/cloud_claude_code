import { useState, useRef, useCallback, useEffect } from 'react'
import { Upload, Loader2, FileCode, FileJson } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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
}

// Get syntax type based on config type
const getSyntaxType = (configType: ConfigType): 'markdown' | 'json' => {
  return configType === ConfigTypes.MCP ? 'json' : 'markdown'
}

// Get accepted file extensions based on config type
const getAcceptedFileTypes = (configType: ConfigType): string => {
  return configType === ConfigTypes.MCP ? '.json' : '.md'
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
    default:
      return configType
  }
}

// Validate file type based on config type
export const validateFileType = (file: File, configType: ConfigType): boolean => {
  const fileName = file.name.toLowerCase()
  if (configType === ConfigTypes.MCP) {
    return fileName.endsWith('.json')
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
  })
  const [errors, setErrors] = useState<ValidationErrors>({})
  const [saving, setSaving] = useState(false)
  const [fileError, setFileError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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
        })
      } else {
        setFormData({
          name: '',
          config_type: configType,
          content: '',
          description: '',
        })
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

    if (!formData.content.trim()) {
      newErrors.content = 'Content is required'
    } else if (configType === ConfigTypes.MCP) {
      const mcpError = validateMCPContent(formData.content)
      if (mcpError) {
        newErrors.content = mcpError
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

          {/* Content field with syntax indicator and upload */}
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
