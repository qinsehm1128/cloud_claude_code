import api from './api'

// ==================== Types ====================

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed'

export interface Task {
  id: number
  container_id: number
  text: string
  status: TaskStatus
  order_index: number
  created_at: string
  updated_at: string
  completed_at?: string
  error?: string
}

// ==================== Task Queue API ====================

export const taskApi = {
  list: (containerId: number) => 
    api.get<Task[]>(`/tasks/${containerId}`),
  
  add: (containerId: number, text: string) => 
    api.post<Task>(`/tasks/${containerId}`, { text }),
  
  get: (containerId: number, taskId: number) =>
    api.get<Task>(`/tasks/${containerId}/${taskId}`),
  
  update: (containerId: number, taskId: number, data: { text?: string; status?: string }) =>
    api.put<Task>(`/tasks/${containerId}/${taskId}`, data),
  
  remove: (containerId: number, taskId: number) =>
    api.delete(`/tasks/${containerId}/${taskId}`),
  
  reorder: (containerId: number, taskIds: number[]) =>
    api.post(`/tasks/${containerId}/reorder`, { task_ids: taskIds }),
  
  clear: (containerId: number) => 
    api.delete(`/tasks/${containerId}/clear`),
  
  clearCompleted: (containerId: number) =>
    api.delete(`/tasks/${containerId}/clear-completed`),
  
  getCount: (containerId: number) =>
    api.get<{ total: number; pending: number }>(`/tasks/${containerId}/count`),
  
  import: async (containerId: number, texts: string[]) => {
    const tasks: Task[] = []
    for (const text of texts) {
      const response = await api.post<Task>(`/tasks/${containerId}`, { text })
      tasks.push(response.data)
    }
    return { data: tasks }
  },
}

export default taskApi
