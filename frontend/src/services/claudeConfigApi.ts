/**
 * Claude Config API Service
 * Provides CRUD operations for Claude configuration templates
 */

import api from './api'
import type {
  ConfigType,
  ClaudeConfigTemplate,
  CreateConfigInput,
  UpdateConfigInput,
} from '@/types/claudeConfig'

// API response types
export interface ListConfigsResponse {
  data: ClaudeConfigTemplate[]
}

export interface GetConfigResponse {
  data: ClaudeConfigTemplate
}

export interface CreateConfigResponse {
  data: ClaudeConfigTemplate
}

export interface UpdateConfigResponse {
  data: ClaudeConfigTemplate
}

/**
 * Claude Config API service object
 * Follows the same pattern as other API services in api.ts
 */
export const claudeConfigApi = {
  /**
   * List all configuration templates, optionally filtered by type
   * @param type - Optional config type filter (CLAUDE_MD, SKILL, MCP, COMMAND)
   * @returns Promise with array of ClaudeConfigTemplate
   */
  list: (type?: ConfigType) =>
    api.get<ClaudeConfigTemplate[]>('/claude-configs', {
      params: type ? { type } : undefined,
    }),

  /**
   * Get a single configuration template by ID
   * @param id - Template ID
   * @returns Promise with ClaudeConfigTemplate
   */
  getById: (id: number) => {
    if (id === undefined || id === null) {
      console.error('claudeConfigApi.getById called with undefined/null id')
      return Promise.reject(new Error('Invalid template ID'))
    }
    return api.get<ClaudeConfigTemplate>(`/claude-configs/${id}`)
  },

  /**
   * Create a new configuration template
   * @param data - Template data (name, config_type, content, description)
   * @returns Promise with created ClaudeConfigTemplate
   */
  create: (data: CreateConfigInput) =>
    api.post<ClaudeConfigTemplate>('/claude-configs', data),

  /**
   * Update an existing configuration template
   * @param id - Template ID
   * @param data - Updated template data
   * @returns Promise with updated ClaudeConfigTemplate
   */
  update: (id: number, data: UpdateConfigInput) => {
    if (id === undefined || id === null) {
      console.error('claudeConfigApi.update called with undefined/null id')
      return Promise.reject(new Error('Invalid template ID'))
    }
    return api.put<ClaudeConfigTemplate>(`/claude-configs/${id}`, data)
  },

  /**
   * Delete a configuration template
   * @param id - Template ID
   * @returns Promise with void (204 No Content on success)
   */
  delete: (id: number) => {
    if (id === undefined || id === null) {
      console.error('claudeConfigApi.delete called with undefined/null id')
      return Promise.reject(new Error('Invalid template ID'))
    }
    return api.delete(`/claude-configs/${id}`)
  },
}

export default claudeConfigApi
