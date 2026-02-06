/**
 * TypeScript types for Claude Config Management
 * Based on backend Go models from internal/models/claude_config_template.go
 */

// ConfigType enum matching backend ConfigType
export type ConfigType = 'CLAUDE_MD' | 'SKILL' | 'MCP' | 'COMMAND' | 'CODEX_CONFIG' | 'CODEX_AUTH' | 'GEMINI_ENV'

// ConfigType constants for convenience
export const ConfigTypes = {
  CLAUDE_MD: 'CLAUDE_MD' as ConfigType,
  SKILL: 'SKILL' as ConfigType,
  MCP: 'MCP' as ConfigType,
  COMMAND: 'COMMAND' as ConfigType,
  CODEX_CONFIG: 'CODEX_CONFIG' as ConfigType,
  CODEX_AUTH: 'CODEX_AUTH' as ConfigType,
  GEMINI_ENV: 'GEMINI_ENV' as ConfigType,
} as const

// ClaudeConfigTemplate interface matching backend model
export interface ClaudeConfigTemplate {
  id: number
  name: string
  config_type: ConfigType
  content: string
  description?: string
  created_at: string
  updated_at: string
  // For archive-based skills (multi-file skills with folder structure)
  is_archive?: boolean
  archive_data?: string // Base64-encoded zip file
}

// Input type for creating a new config template
export interface CreateConfigInput {
  name: string
  config_type: ConfigType
  content: string
  description?: string
  // For archive-based skills
  is_archive?: boolean
  archive_data?: string // Base64-encoded zip file
}

// Input type for updating an existing config template
export interface UpdateConfigInput {
  name?: string
  config_type?: ConfigType
  content?: string
  description?: string
}

// FailedTemplate represents a template that failed to inject
export interface FailedTemplate {
  template_name: string
  config_type: string
  reason: string
}

// InjectionStatus represents the result of config injection into a container
export interface InjectionStatus {
  container_id: string
  successful: string[]
  failed: FailedTemplate[]
  warnings: string[]
  injected_at: string
}

// SkillMetadata parsed from Markdown frontmatter (runtime only)
export interface SkillMetadata {
  allowed_tools?: string[]
  disable_model_invocation?: boolean
}

// MCPServerConfig for MCP type templates
export interface MCPServerConfig {
  name: string
  command: string
  args: string[]
  env?: Record<string, string>
  transport?: string
  url?: string
}
