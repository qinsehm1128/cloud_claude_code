import axios from 'axios'
import { toast } from '@/components/ui/toast'

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
  withCredentials: true, // Send cookies with requests
})

// Response interceptor to handle auth errors and show error toasts
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Handle auth errors
    if (error.response?.status === 401) {
      // Redirect to login if not already there
      if (window.location.pathname !== '/login') {
        window.location.href = '/login'
      }
      return Promise.reject(error)
    }

    // Show error toast for other errors
    const errorMessage = error.response?.data?.error || error.message || 'Request failed'
    const statusCode = error.response?.status
    
    // Don't show toast for cancelled requests
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

// Auth API
export const authApi = {
  login: (username: string, password: string) =>
    api.post('/auth/login', { username, password }),
  logout: () => api.post('/auth/logout'),
  verify: () => api.get('/auth/verify'),
}

// Settings API
export const settingsApi = {
  getGitHubConfig: () => api.get('/settings/github'),
  saveGitHubToken: (token: string) => api.post('/settings/github', { token }),
  getClaudeConfig: () => api.get('/settings/claude'),
  saveClaudeConfig: (config: {
    custom_env_vars?: string
    startup_command?: string
  }) => api.post('/settings/claude', config),
}

// Repository API
export const repoApi = {
  listRemote: () => api.get('/repos/remote'),
  listLocal: () => api.get('/repos/local'),
  clone: (url: string, name: string) => api.post('/repos/clone', { url, name }),
  delete: (id: number) => api.delete(`/repos/${id}`),
}

// Port mapping type
export interface PortMapping {
  container_port: number
  host_port: number
}

// Proxy configuration type
export interface ProxyConfig {
  enabled: boolean
  domain?: string
  port?: number
  service_port?: number
}

// Container port info
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

// Container API
export const containerApi = {
  list: () => api.get('/containers'),
  get: (id: number) => api.get(`/containers/${id}`),
  getStatus: (id: number) => api.get(`/containers/${id}/status`),
  getLogs: (id: number, limit?: number) => 
    api.get(`/containers/${id}/logs`, { params: { limit: limit || 100 } }),
  create: (
    name: string, 
    gitRepoUrl: string, 
    gitRepoName?: string, 
    skipClaudeInit?: boolean,
    memoryLimit?: number,
    cpuLimit?: number,
    portMappings?: PortMapping[],
    proxy?: ProxyConfig,
    enableCodeServer?: boolean
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
      enable_code_server: enableCodeServer || false
    }),
  start: (id: number) => api.post(`/containers/${id}/start`),
  stop: (id: number) => api.post(`/containers/${id}/stop`),
  delete: (id: number) => api.delete(`/containers/${id}`),
}

// Docker container info type
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

// Docker API (direct Docker container management)
export const dockerApi = {
  listContainers: () => api.get<DockerContainerInfo[]>('/docker/containers'),
  stopContainer: (dockerId: string) => api.post(`/docker/containers/${dockerId}/stop`),
  removeContainer: (dockerId: string) => api.delete(`/docker/containers/${dockerId}`),
}

// Port management API
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
    api.get(`/files/${containerId}/download`, {
      params: { path },
      responseType: 'blob',
    }),
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
