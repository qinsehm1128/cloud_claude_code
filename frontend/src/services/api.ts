import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
})

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

// Response interceptor to handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      window.location.href = '/login'
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

// Container API
export const containerApi = {
  list: () => api.get('/containers'),
  get: (id: number) => api.get(`/containers/${id}`),
  getStatus: (id: number) => api.get(`/containers/${id}/status`),
  getLogs: (id: number, limit?: number) => 
    api.get(`/containers/${id}/logs`, { params: { limit: limit || 100 } }),
  create: (name: string, gitRepoUrl: string, gitRepoName?: string) =>
    api.post('/containers', { name, git_repo_url: gitRepoUrl, git_repo_name: gitRepoName }),
  start: (id: number) => api.post(`/containers/${id}/start`),
  stop: (id: number) => api.post(`/containers/${id}/stop`),
  delete: (id: number) => api.delete(`/containers/${id}`),
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
