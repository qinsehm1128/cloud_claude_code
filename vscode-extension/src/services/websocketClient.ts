import * as vscode from 'vscode';

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

export interface Task {
  id: number;
  text: string;
  status: string;
  priority: number;
  createdAt: string;
}

export interface MonitoringConfig {
  silenceThreshold: number;
  activeStrategy: string;
  webhookUrl?: string;
  injectionCommand?: string;
  userPromptTemplate?: string;
  aiEndpoint?: string;
  aiModel?: string;
}

type StatusCallback = (status: MonitoringStatus) => void;
type TasksCallback = (tasks: Task[]) => void;
type ConnectionCallback = (connected: boolean) => void;
type NotificationCallback = (message: string, type: string) => void;

export class WebSocketClient {
  public serverUrl: string;
  private containerId: string | null;
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private connected = false;

  private statusCallbacks: StatusCallback[] = [];
  private tasksCallbacks: TasksCallback[] = [];
  private connectionCallbacks: ConnectionCallback[] = [];
  private notificationCallbacks: NotificationCallback[] = [];

  private cachedStatus: MonitoringStatus | null = null;
  private cachedTasks: Task[] = [];

  constructor(serverUrl: string, containerId: string | null) {
    this.serverUrl = serverUrl;
    this.containerId = containerId;
  }

  public connect() {
    if (!this.containerId) {
      console.log('No container ID detected, skipping WebSocket connection');
      return;
    }

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return;
    }

    const wsUrl = this.serverUrl.replace(/^http/, 'ws') + `/api/ws/terminal/${this.containerId}`;
    
    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('WebSocket connected');
        this.connected = true;
        this.reconnectAttempts = 0;
        this.notifyConnectionChange(true);
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };

      this.ws.onclose = () => {
        console.log('WebSocket disconnected');
        this.connected = false;
        this.notifyConnectionChange(false);
        this.scheduleReconnect();
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };
    } catch (error) {
      console.error('Failed to create WebSocket:', error);
      this.scheduleReconnect();
    }
  }

  public disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
  }

  public updateServerUrl(newUrl: string) {
    if (this.serverUrl !== newUrl) {
      this.serverUrl = newUrl;
      this.disconnect();
      this.connect();
    }
  }

  public updateContainerId(containerId: string | null) {
    if (this.containerId !== containerId) {
      this.containerId = containerId;
      this.disconnect();
      if (containerId) {
        this.connect();
      }
    }
  }

  private scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('Max reconnect attempts reached');
      return;
    }

    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts);
    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(() => {
      console.log(`Reconnecting... (attempt ${this.reconnectAttempts})`);
      this.connect();
    }, delay);
  }

  private handleMessage(data: string) {
    try {
      const message = JSON.parse(data);
      
      switch (message.type) {
        case 'monitoring_status':
          this.cachedStatus = message.data;
          this.notifyStatusUpdate(message.data);
          break;
        case 'tasks_update':
          this.cachedTasks = message.data;
          this.notifyTasksUpdate(message.data);
          break;
        case 'notification':
          this.notifyNotification(message.data.message, message.data.type);
          break;
        case 'strategy_triggered':
          // Show notification when strategy is triggered
          vscode.window.showInformationMessage(
            `PTY: ${message.data.strategy} strategy triggered`
          );
          break;
      }
    } catch (error) {
      // Ignore non-JSON messages (terminal output)
    }
  }

  public send(type: string, data: unknown) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, data }));
    }
  }

  // API methods
  public async toggleMonitoring(): Promise<void> {
    this.send('toggle_monitoring', {});
  }

  public async updateConfig(config: Partial<MonitoringConfig>): Promise<void> {
    this.send('update_config', config);
  }

  public async addTask(text: string, priority?: number): Promise<void> {
    this.send('add_task', { text, priority });
  }

  public async removeTask(taskId: number): Promise<void> {
    this.send('remove_task', { taskId });
  }

  public async reorderTasks(taskIds: number[]): Promise<void> {
    this.send('reorder_tasks', { taskIds });
  }

  public async clearTasks(): Promise<void> {
    this.send('clear_tasks', {});
  }

  // Subscription methods
  public onStatusUpdate(callback: StatusCallback): void {
    this.statusCallbacks.push(callback);
    // Send cached status immediately if available
    if (this.cachedStatus) {
      callback(this.cachedStatus);
    }
  }

  public onTasksUpdate(callback: TasksCallback): void {
    this.tasksCallbacks.push(callback);
    // Send cached tasks immediately if available
    if (this.cachedTasks.length > 0) {
      callback(this.cachedTasks);
    }
  }

  public onConnectionChange(callback: ConnectionCallback): void {
    this.connectionCallbacks.push(callback);
    // Send current state immediately
    callback(this.connected);
  }

  public onNotification(callback: NotificationCallback): void {
    this.notificationCallbacks.push(callback);
  }

  private notifyStatusUpdate(status: MonitoringStatus) {
    this.statusCallbacks.forEach((cb) => cb(status));
  }

  private notifyTasksUpdate(tasks: Task[]) {
    this.tasksCallbacks.forEach((cb) => cb(tasks));
  }

  private notifyConnectionChange(connected: boolean) {
    this.connectionCallbacks.forEach((cb) => cb(connected));
  }

  private notifyNotification(message: string, type: string) {
    this.notificationCallbacks.forEach((cb) => cb(message, type));
    
    // Also show VS Code notification
    switch (type) {
      case 'error':
        vscode.window.showErrorMessage(`PTY: ${message}`);
        break;
      case 'warning':
        vscode.window.showWarningMessage(`PTY: ${message}`);
        break;
      default:
        vscode.window.showInformationMessage(`PTY: ${message}`);
    }
  }

  public isConnected(): boolean {
    return this.connected;
  }

  public getCachedStatus(): MonitoringStatus | null {
    return this.cachedStatus;
  }

  public getCachedTasks(): Task[] {
    return this.cachedTasks;
  }
}
