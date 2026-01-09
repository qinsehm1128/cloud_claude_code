import api from './api'

// ==================== Types ====================

export interface MonitoringStatus {
  container_id: number
  enabled: boolean
  silence_duration: number
  threshold: number
  strategy: string
  queue_size: number
  current_task?: { id: number; text: string; status: string }
  last_action?: { strategy: string; action: string; timestamp: string; success: boolean }
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

// ==================== Monitoring API ====================

export const monitoringApi = {
  getStatus: (containerId: number) =>
    api.get<MonitoringStatus>(`/monitoring/${containerId}/status`),
  getConfig: (containerId: number) =>
    api.get<MonitoringConfig>(`/monitoring/${containerId}/config`),
  updateConfig: (containerId: number, config: Partial<MonitoringConfig>) =>
    api.put(`/monitoring/${containerId}/config`, config),
  enable: (containerId: number, config?: Partial<MonitoringConfig>) =>
    api.post(`/monitoring/${containerId}/enable`, config || {}),
  disable: (containerId: number) => 
    api.post(`/monitoring/${containerId}/disable`),
  getContextBuffer: (containerId: number) =>
    api.get<{ context: string }>(`/monitoring/${containerId}/context`),
  listStrategies: () => 
    api.get<StrategyInfo[]>('/monitoring/strategies'),
}

export default monitoringApi
