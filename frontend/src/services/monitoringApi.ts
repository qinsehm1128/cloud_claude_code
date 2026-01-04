import axios from 'axios';

const API_BASE = '/api';

export interface MonitoringStatus {
  enabled: boolean;
  silenceDuration: number;
  threshold: number;
  strategy: string;
  queueSize: number;
  currentTask?: {
    id: number;
    text: string;
    status: string;
  };
  lastAction?: {
    strategy: string;
    action: string;
    timestamp: string;
    success: boolean;
  };
}

export interface MonitoringConfig {
  silenceThreshold: number;
  activeStrategy: string;
  webhookUrl?: string;
  webhookTimeout?: number;
  webhookRetryCount?: number;
  webhookHeaders?: Record<string, string>;
  injectionCommand?: string;
  injectionDelay?: number;
  userPromptTemplate?: string;
  aiEndpoint?: string;
  aiApiKey?: string;
  aiModel?: string;
  aiTimeout?: number;
  aiSystemPrompt?: string;
  aiFallbackStrategy?: string;
}

export interface ContextBuffer {
  data: string;
  size: number;
  capacity: number;
}

export const monitoringApi = {
  // Get monitoring status for a container
  getStatus: async (containerId: number | string): Promise<MonitoringStatus> => {
    const response = await axios.get(`${API_BASE}/monitoring/${containerId}/status`);
    return response.data;
  },

  // Enable monitoring for a container
  enable: async (containerId: number | string): Promise<void> => {
    await axios.post(`${API_BASE}/monitoring/${containerId}/enable`);
  },

  // Disable monitoring for a container
  disable: async (containerId: number | string): Promise<void> => {
    await axios.post(`${API_BASE}/monitoring/${containerId}/disable`);
  },

  // Toggle monitoring for a container
  toggle: async (containerId: number | string, enabled: boolean): Promise<void> => {
    if (enabled) {
      await monitoringApi.enable(containerId);
    } else {
      await monitoringApi.disable(containerId);
    }
  },

  // Get monitoring configuration for a container
  getConfig: async (containerId: number | string): Promise<MonitoringConfig> => {
    const response = await axios.get(`${API_BASE}/monitoring/${containerId}/config`);
    return response.data;
  },

  // Update monitoring configuration for a container
  updateConfig: async (containerId: number | string, config: Partial<MonitoringConfig>): Promise<void> => {
    await axios.put(`${API_BASE}/monitoring/${containerId}/config`, config);
  },

  // Get context buffer for a container
  getContextBuffer: async (containerId: number | string): Promise<ContextBuffer> => {
    const response = await axios.get(`${API_BASE}/monitoring/${containerId}/context`);
    return response.data;
  },

  // Get global automation configuration
  getGlobalConfig: async (): Promise<MonitoringConfig> => {
    const response = await axios.get(`${API_BASE}/monitoring/config`);
    return response.data;
  },

  // Update global automation configuration
  updateGlobalConfig: async (config: Partial<MonitoringConfig>): Promise<void> => {
    await axios.put(`${API_BASE}/monitoring/config`, config);
  },

  // Manually trigger strategy execution
  triggerStrategy: async (containerId: number | string): Promise<void> => {
    await axios.post(`${API_BASE}/monitoring/${containerId}/trigger`);
  },
};

export default monitoringApi;
