import axios from 'axios';

const API_BASE = '/api';

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface Task {
  id: number;
  containerId: number;
  text: string;
  status: TaskStatus;
  order: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  error?: string;
}

export interface CreateTaskRequest {
  text: string;
}

export interface UpdateTaskRequest {
  text?: string;
  status?: TaskStatus;
}

export interface ReorderTasksRequest {
  taskIds: number[];
}

export interface TaskListResponse {
  tasks: Task[];
  total: number;
  pendingCount: number;
  completedCount: number;
}

export const taskApi = {
  // Get all tasks for a container
  getTasks: async (containerId: number | string): Promise<TaskListResponse> => {
    const response = await axios.get(`${API_BASE}/tasks/${containerId}`);
    return response.data;
  },

  // Add a new task
  addTask: async (containerId: number | string, text: string): Promise<Task> => {
    const response = await axios.post(`${API_BASE}/tasks/${containerId}`, { text });
    return response.data;
  },

  // Add multiple tasks at once
  addTasks: async (containerId: number | string, texts: string[]): Promise<Task[]> => {
    const response = await axios.post(`${API_BASE}/tasks/${containerId}/batch`, { texts });
    return response.data;
  },

  // Get a specific task
  getTask: async (containerId: number | string, taskId: number): Promise<Task> => {
    const response = await axios.get(`${API_BASE}/tasks/${containerId}/${taskId}`);
    return response.data;
  },

  // Update a task
  updateTask: async (
    containerId: number | string,
    taskId: number,
    update: UpdateTaskRequest
  ): Promise<Task> => {
    const response = await axios.put(`${API_BASE}/tasks/${containerId}/${taskId}`, update);
    return response.data;
  },

  // Delete a task
  deleteTask: async (containerId: number | string, taskId: number): Promise<void> => {
    await axios.delete(`${API_BASE}/tasks/${containerId}/${taskId}`);
  },

  // Reorder tasks
  reorderTasks: async (containerId: number | string, taskIds: number[]): Promise<void> => {
    await axios.post(`${API_BASE}/tasks/${containerId}/reorder`, { taskIds });
  },

  // Clear all tasks for a container
  clearTasks: async (containerId: number | string): Promise<void> => {
    await axios.delete(`${API_BASE}/tasks/${containerId}/clear`);
  },

  // Get the next pending task
  getNextTask: async (containerId: number | string): Promise<Task | null> => {
    const response = await axios.get(`${API_BASE}/tasks/${containerId}/next`);
    return response.data;
  },

  // Mark a task as completed
  completeTask: async (containerId: number | string, taskId: number): Promise<Task> => {
    return taskApi.updateTask(containerId, taskId, { status: 'completed' });
  },

  // Mark a task as failed
  failTask: async (containerId: number | string, taskId: number, error?: string): Promise<Task> => {
    const response = await axios.put(`${API_BASE}/tasks/${containerId}/${taskId}`, {
      status: 'failed',
      error,
    });
    return response.data;
  },
};

export default taskApi;
