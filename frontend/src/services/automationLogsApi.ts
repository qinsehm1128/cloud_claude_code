import axios from 'axios';

const API_BASE = '/api';

export interface AutomationLog {
  id: number;
  containerId: number;
  sessionId: string;
  strategyType: string;
  triggerReason: string;
  contextSnapshot: string;
  action: string;
  result: string;
  errorMessage?: string;
  duration: number;
  createdAt: string;
}

export interface LogsResponse {
  logs: AutomationLog[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface LogsFilter {
  containerId?: number;
  strategy?: string;
  result?: string;
  from?: number;
  to?: number;
  page?: number;
  pageSize?: number;
}

export interface StrategyStats {
  strategy_type: string;
  count: number;
  success_count: number;
  failed_count: number;
}

export interface LogStats {
  total_count: number;
  recent_count: number;
  strategy_stats: StrategyStats[];
}

export const automationLogsApi = {
  // List logs with filtering and pagination
  listLogs: async (filter: LogsFilter = {}): Promise<LogsResponse> => {
    const params = new URLSearchParams();
    if (filter.containerId) params.append('container_id', filter.containerId.toString());
    if (filter.strategy) params.append('strategy', filter.strategy);
    if (filter.result) params.append('result', filter.result);
    if (filter.from) params.append('from', filter.from.toString());
    if (filter.to) params.append('to', filter.to.toString());
    if (filter.page) params.append('page', filter.page.toString());
    if (filter.pageSize) params.append('page_size', filter.pageSize.toString());

    const response = await axios.get(`${API_BASE}/logs/automation?${params.toString()}`);
    return response.data;
  },

  // Get a single log by ID
  getLog: async (id: number): Promise<AutomationLog> => {
    const response = await axios.get(`${API_BASE}/logs/automation/${id}`);
    return response.data;
  },

  // Get logs for a specific container
  getLogsByContainer: async (containerId: number, limit = 50): Promise<{ logs: AutomationLog[]; count: number }> => {
    const response = await axios.get(`${API_BASE}/logs/automation/container/${containerId}?limit=${limit}`);
    return response.data;
  },

  // Get log statistics
  getStats: async (containerId?: number): Promise<LogStats> => {
    const params = containerId ? `?container_id=${containerId}` : '';
    const response = await axios.get(`${API_BASE}/logs/automation/stats${params}`);
    return response.data;
  },

  // Delete old logs
  deleteOldLogs: async (days = 30): Promise<{ deleted_count: number; cutoff_date: string }> => {
    const response = await axios.delete(`${API_BASE}/logs/automation/cleanup?days=${days}`);
    return response.data;
  },

  // Export logs
  exportLogs: async (filter: { containerId?: number; from?: number; to?: number } = {}): Promise<Blob> => {
    const params = new URLSearchParams();
    if (filter.containerId) params.append('container_id', filter.containerId.toString());
    if (filter.from) params.append('from', filter.from.toString());
    if (filter.to) params.append('to', filter.to.toString());

    const response = await axios.get(`${API_BASE}/logs/automation/export?${params.toString()}`, {
      responseType: 'blob',
    });
    return response.data;
  },
};

export default automationLogsApi;
