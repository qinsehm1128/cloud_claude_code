import axios, { AxiosError, AxiosResponse } from 'axios'
import { toast } from '@/components/ui/toast'
import { getApiBaseUrl } from './serverAddressManager'

// ==================== Base Axios Instance ====================

/**
 * Gets the dynamic base URL for API requests
 * Uses serverAddressManager to get the current server address
 *
 * Requirements: 4.1, 4.2, 4.3
 */
export function getBaseUrl(): string {
  return getApiBaseUrl()
}

const api = axios.create({
  // baseURL is set dynamically via request interceptor
  timeout: 30000,
  withCredentials: true, // Required for CORS with credentials (Requirements: 6.1, 6.2)
})

// Request interceptor to set dynamic baseURL
// Requirements: 4.1, 4.3, 4.4
api.interceptors.request.use((config) => {
  config.baseURL = getBaseUrl()
  return config
})

// Response interceptor to handle auth errors and show error toasts
api.interceptors.response.use(
  (response: AxiosResponse) => response,
  (error: AxiosError<{ error?: string }>) => {
    // Handle auth errors
    if (error.response?.status === 401) {
      if (window.location.pathname !== '/login') {
        window.location.href = '/login'
      }
      return Promise.reject(error)
    }

    const errorMessage = error.response?.data?.error || error.message || 'Request failed'
    const statusCode = error.response?.status

    if (axios.isCancel(error)) {
      return Promise.reject(error)
    }

    // Show appropriate error message
    if (statusCode === 404) {
      toast.error('Not Found', errorMessage)
    } else if (statusCode === 400) {
      toast.error('Bad Request', errorMessage)
    } else if (statusCode === 403) {
      toast.error('Forbidden', errorMessage)
    } else if (statusCode === 500) {
      toast.error('Server Error', errorMessage)
    } else if (error.code === 'ECONNABORTED') {
      toast.error('Timeout', 'Request timed out')
    } else if (!error.response) {
      toast.error('Network Error', 'Unable to connect to server')
    } else {
      toast.error('Error', errorMessage)
    }

    return Promise.reject(error)
  }
)

export default api

// ==================== Core API (Auth, Settings, Repo, Container, etc.) ====================

// Auth API
export const authApi = {
  login: (username: string, password: string) =>
    api.post('/auth/login', { username, password }),
  logout: () => api.post('/auth/logout'),
  verify: () => api.get('/auth/verify'),
}

// Settings API (legacy)
export const settingsApi = {
  getGitHubConfig: () => api.get('/settings/github'),
  saveGitHubToken: (token: string) => api.post('/settings/github', { token }),
  getClaudeConfig: () => api.get('/settings/claude'),
  saveClaudeConfig: (config: { custom_env_vars?: string; startup_command?: string }) =>
    api.post('/settings/claude', config),
}

// ==================== Config Profile Types ====================

export interface GitHubTokenItem {
  id: number
  nickname: string
  remark?: string
  is_default: boolean
  created_at: string
  updated_at: string
}

export interface EnvVarsProfile {
  id: number
  name: string
  description?: string
  env_vars: string
  api_url_var_name?: string
  api_token_var_name?: string
  is_default: boolean
  created_at: string
  updated_at: string
}

export interface StartupCommandProfile {
  id: number
  name: string
  description?: string
  command: string
  is_default: boolean
  created_at: string
  updated_at: string
}

// Config Profile API (new multi-config)
export const configProfileApi = {
  // GitHub Tokens
  listGitHubTokens: () => api.get<GitHubTokenItem[]>('/settings/github-tokens'),
  createGitHubToken: (data: { nickname: string; remark?: string; token: string; is_default?: boolean }) =>
    api.post<GitHubTokenItem>('/settings/github-tokens', data),
  updateGitHubToken: (id: number, data: { nickname?: string; remark?: string; token?: string; is_default?: boolean }) =>
    api.put(`/settings/github-tokens/${id}`, data),
  deleteGitHubToken: (id: number) => api.delete(`/settings/github-tokens/${id}`),
  setDefaultGitHubToken: (id: number) => api.put(`/settings/github-tokens/${id}/default`),

  // Env Profiles
  listEnvProfiles: () => api.get<EnvVarsProfile[]>('/settings/env-profiles'),
  createEnvProfile: (data: { name: string; description?: string; env_vars: string; api_url_var_name?: string; api_token_var_name?: string; is_default?: boolean }) =>
    api.post<EnvVarsProfile>('/settings/env-profiles', data),
  updateEnvProfile: (id: number, data: { name?: string; description?: string; env_vars?: string; api_url_var_name?: string; api_token_var_name?: string; is_default?: boolean }) =>
    api.put(`/settings/env-profiles/${id}`, data),
  deleteEnvProfile: (id: number) => api.delete(`/settings/env-profiles/${id}`),
  setDefaultEnvProfile: (id: number) => api.put(`/settings/env-profiles/${id}/default`),

  // Command Profiles
  listCommandProfiles: () => api.get<StartupCommandProfile[]>('/settings/command-profiles'),
  createCommandProfile: (data: { name: string; description?: string; command: string; is_default?: boolean }) =>
    api.post<StartupCommandProfile>('/settings/command-profiles', data),
  updateCommandProfile: (id: number, data: { name?: string; description?: string; command?: string; is_default?: boolean }) =>
    api.put(`/settings/command-profiles/${id}`, data),
  deleteCommandProfile: (id: number) => api.delete(`/settings/command-profiles/${id}`),
  setDefaultCommandProfile: (id: number) => api.put(`/settings/command-profiles/${id}/default`),
}

// Repository API
export const repoApi = {
  listRemote: (tokenId?: number) => api.get('/repos/remote', { params: tokenId ? { token_id: tokenId } : undefined }),
  listLocal: () => api.get('/repos/local'),
  clone: (url: string, name: string) => api.post('/repos/clone', { url, name }),
  delete: (id: number) => api.delete(`/repos/${id}`),
}

// ==================== Container Types ====================

export interface PortMapping {
  container_port: number
  host_port: number
}

export interface ProxyConfig {
  enabled: boolean
  domain?: string
  port?: number
  service_port?: number
}

export interface ContainerPortInfo {
  id: number
  container_id: number
  container_name: string
  port: number
  name: string
  protocol: string
  auto_created: boolean
  proxy_url: string
}

export interface DockerContainerInfo {
  id: string
  name: string
  image: string
  status: string
  state: string
  created: number
  ports: string[]
  is_managed: boolean
}

// Claude Config Selection for container creation
export interface ClaudeConfigSelection {
  selected_claude_md?: number      // Single CLAUDE.MD template ID
  selected_skills?: number[]       // Multiple Skill template IDs
  selected_mcps?: number[]         // Multiple MCP template IDs
  selected_commands?: number[]     // Multiple Command template IDs
}

// Container API
export const containerApi = {
  list: () => api.get('/containers'),
  get: (id: number) => api.get(`/containers/${id}`),
  getStatus: (id: number) => api.get(`/containers/${id}/status`),
  getLogs: (id: number, limit?: number) =>
    api.get(`/containers/${id}/logs`, { params: { limit: limit || 100 } }),
  getApiConfig: (id: number) => api.get<{ api_url: string; api_token: string }>(`/containers/${id}/api-config`),
  create: (
    name: string,
    gitRepoUrl: string,
    gitRepoName?: string,
    skipClaudeInit?: boolean,
    memoryLimit?: number,
    cpuLimit?: number,
    portMappings?: PortMapping[],
    proxy?: ProxyConfig,
    enableCodeServer?: boolean,
    githubTokenId?: number,
    envVarsProfileId?: number,
    startupCommandProfileId?: number,
    // New fields for claude config management
    skipGitRepo?: boolean,
    enableYoloMode?: boolean,
    claudeConfigSelection?: ClaudeConfigSelection
  ) =>
    api.post('/containers', {
      name,
      git_repo_url: gitRepoUrl,
      git_repo_name: gitRepoName,
      skip_claude_init: skipClaudeInit,
      memory_limit: memoryLimit || 0,
      cpu_limit: cpuLimit || 0,
      port_mappings: portMappings || [],
      proxy: proxy || { enabled: false },
      enable_code_server: enableCodeServer || false,
      github_token_id: githubTokenId,
      env_vars_profile_id: envVarsProfileId,
      startup_command_profile_id: startupCommandProfileId,
      // New fields for claude config management
      skip_git_repo: skipGitRepo || false,
      enable_yolo_mode: enableYoloMode || false,
      selected_claude_md: claudeConfigSelection?.selected_claude_md,
      selected_skills: claudeConfigSelection?.selected_skills || [],
      selected_mcps: claudeConfigSelection?.selected_mcps || [],
      selected_commands: claudeConfigSelection?.selected_commands || [],
    }),
  start: (id: number) => api.post(`/containers/${id}/start`),
  stop: (id: number) => api.post(`/containers/${id}/stop`),
  delete: (id: number) => api.delete(`/containers/${id}`),
}

// Docker API
export const dockerApi = {
  listContainers: () => api.get<DockerContainerInfo[]>('/docker/containers'),
  stopContainer: (dockerId: string) => api.post(`/docker/containers/${dockerId}/stop`),
  removeContainer: (dockerId: string) => api.delete(`/docker/containers/${dockerId}`),
}

// Port API
export const portApi = {
  list: (containerId: number) => api.get(`/containers/${containerId}/ports`),
  add: (containerId: number, port: number, name?: string, protocol?: string) =>
    api.post(`/containers/${containerId}/ports`, { port, name, protocol }),
  remove: (containerId: number, port: number) =>
    api.delete(`/containers/${containerId}/ports/${port}`),
  listAll: () => api.get('/ports'),
}

// File API
export const fileApi = {
  listDirectory: (containerId: number, path: string) =>
    api.get(`/files/${containerId}/list`, { params: { path } }),
  download: (containerId: number, path: string) =>
    api.get(`/files/${containerId}/download`, { params: { path }, responseType: 'blob' }),
  upload: (containerId: number, path: string, file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('path', path)
    return api.post(`/files/${containerId}/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
  delete: (containerId: number, path: string) =>
    api.delete(`/files/${containerId}`, { params: { path } }),
  createDirectory: (containerId: number, path: string) =>
    api.post(`/files/${containerId}/mkdir`, { path }),
}
