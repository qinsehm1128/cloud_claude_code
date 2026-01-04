import api from './api'

export interface MonitoringStatus {
  container_id: number
  enabled: boolean
  silence_duration: number
  threshold: number
  strategy: string
  queue_size: number
  current_task?: {
    id: number
    text: string
    status: string
  }
  last_action?: {
    strategy: string
    action: string
    timestamp: string
    success: boolean
  }
}

export interface MonitoringConfig {
  id?: number
  container_id: number
  enabled: boolean
  silence_threshold: number
  active_strategy: string
  webhook_url?: string
  injection_command?: string
  user_prompt_template?: string
  context_buffer_size: number
}

export interface StrategyInfo {
  name: string
  description: string
  enabled: boolean
}

export interface Task {
  id: number
  container_id: number
  text: string
  status: string
  order_index: number
  created_at: string
  updated_at: string
}

// Monitoring API
export const monitoringApi = {
  // Get monitoring status
  getStatus: (containerId: number) =>
    api.get<MonitoringStatus>(`/monitoring/${containerId}/status`),

  // Get monitoring config
  getConfig: (containerId: number) =>
    api.get<MonitoringConfig>(`/monitoring/${containerId}/config`),

  // Update monitoring config
  updateConfig: (containerId: number, config: Partial<MonitoringConfig>) =>
    api.put(`/monitoring/${containerId}/config`, config),

  // Enable monitoring
  enable: (containerId: number, config?: Partial<MonitoringConfig>) =>
    api.post(`/monitoring/${containerId}/enable`, config || {}),

  // Disable monitoring
  disable: (containerId: number) =>
    api.post(`/monitoring/${containerId}/disable`),

  // Get context buffer
  getContextBuffer: (containerId: number) =>
    api.get<{ context: string }>(`/monitoring/${containerId}/context`),

  // List available strategies
  listStrategies: () =>
    api.get<StrategyInfo[]>('/monitoring/strategies'),
}

// Task Queue API
export const taskQueueApi = {
  // List tasks for a container
  list: (containerId: number) =>
    api.get<Task[]>(`/tasks/${containerId}`),

  // Add a task
  add: (containerId: number, text: string) =>
    api.post<Task>(`/tasks/${containerId}`, { text }),

  // Remove a task
  remove: (containerId: number, taskId: number) =>
    api.delete(`/tasks/${containerId}/${taskId}`),

  // Reorder tasks
  reorder: (containerId: number, taskIds: number[]) =>
    api.put(`/tasks/${containerId}/reorder`, { task_ids: taskIds }),

  // Clear all tasks
  clear: (containerId: number) =>
    api.delete(`/tasks/${containerId}`),

  // Import tasks (batch add)
  import: (containerId: number, texts: string[]) =>
    api.post<Task[]>(`/tasks/${containerId}/import`, { texts }),
}

export default monitoringApi
