export interface TerminalMessage {
  type: 'input' | 'output' | 'resize' | 'error' | 'ping' | 'pong' | 'history' | 'history_start' | 'history_end' | 'session' | 'close' | 'monitoring_status' | 'task_update' | 'strategy_triggered'
  data?: string
  cols?: number
  rows?: number
  error?: string
  session_id?: string
  total_size?: number
  chunk_index?: number
  total_chunks?: number
  // Monitoring fields
  monitoring?: MonitoringStatusMessage
  task?: TaskUpdateMessage
  strategy?: StrategyTriggeredMessage
}

export interface MonitoringStatusMessage {
  enabled: boolean
  silenceDuration: number
  threshold: number
  strategy: string
  queueSize: number
  currentTask?: {
    id: number
    text: string
    status: string
  }
}

export interface TaskUpdateMessage {
  action: 'added' | 'removed' | 'updated' | 'reordered' | 'cleared'
  task?: {
    id: number
    text: string
    status: string
    order: number
  }
  tasks?: Array<{
    id: number
    text: string
    status: string
    order: number
  }>
}

export interface StrategyTriggeredMessage {
  strategy: string
  action: string
  success: boolean
  timestamp: string
  error?: string
}

export interface HistoryLoadProgress {
  loading: boolean
  totalSize: number
  totalChunks: number
  loadedChunks: number
  percent: number
}

// Helper to get cookie value
function getCookie(name: string): string | null {
  const value = `; ${document.cookie}`
  const parts = value.split(`; ${name}=`)
  if (parts.length === 2) {
    return parts.pop()?.split(';').shift() || null
  }
  return null
}

export class TerminalWebSocket {
  private ws: WebSocket | null = null
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 1000
  private containerId: string
  private sessionId: string | null = null
  private onMessage: (msg: TerminalMessage) => void
  private onConnect: () => void
  private onDisconnect: () => void
  private onError: (error: string) => void
  private onSessionId?: (sessionId: string) => void
  private onHistoryStart?: (totalSize: number, totalChunks: number) => void
  private onHistoryChunk?: (data: string, chunkIndex: number, totalChunks: number) => void
  private onHistoryEnd?: () => void
  private onHistoryProgress?: (progress: HistoryLoadProgress) => void
  private onMonitoringStatus?: (status: MonitoringStatusMessage) => void
  private onTaskUpdate?: (update: TaskUpdateMessage) => void
  private onStrategyTriggered?: (event: StrategyTriggeredMessage) => void

  constructor(
    containerId: string,
    callbacks: {
      onMessage: (msg: TerminalMessage) => void
      onConnect: () => void
      onDisconnect: () => void
      onError: (error: string) => void
      onSessionId?: (sessionId: string) => void
      onHistoryStart?: (totalSize: number, totalChunks: number) => void
      onHistoryChunk?: (data: string, chunkIndex: number, totalChunks: number) => void
      onHistoryEnd?: () => void
      onHistoryProgress?: (progress: HistoryLoadProgress) => void
      onMonitoringStatus?: (status: MonitoringStatusMessage) => void
      onTaskUpdate?: (update: TaskUpdateMessage) => void
      onStrategyTriggered?: (event: StrategyTriggeredMessage) => void
    },
    sessionId?: string
  ) {
    this.containerId = containerId
    this.sessionId = sessionId || null
    this.onMessage = callbacks.onMessage
    this.onConnect = callbacks.onConnect
    this.onDisconnect = callbacks.onDisconnect
    this.onError = callbacks.onError
    this.onSessionId = callbacks.onSessionId
    this.onHistoryStart = callbacks.onHistoryStart
    this.onHistoryChunk = callbacks.onHistoryChunk
    this.onHistoryEnd = callbacks.onHistoryEnd
    this.onHistoryProgress = callbacks.onHistoryProgress
    this.onMonitoringStatus = callbacks.onMonitoringStatus
    this.onTaskUpdate = callbacks.onTaskUpdate
    this.onStrategyTriggered = callbacks.onStrategyTriggered
  }

  connect() {
    // Get token from httpOnly cookie (for same-origin) or fallback
    // Note: httpOnly cookies are not accessible via JS, but WebSocket
    // will send them automatically for same-origin requests.
    // For cross-origin or when cookie is not httpOnly, we use query param.
    const token = getCookie('cc_token')
    
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    let wsUrl = `${protocol}//${window.location.host}/api/ws/terminal/${this.containerId}`
    
    // Build query params
    const params = new URLSearchParams()
    if (token) {
      params.set('token', token)
    }
    if (this.sessionId) {
      params.set('session', this.sessionId)
    }
    
    const queryString = params.toString()
    if (queryString) {
      wsUrl += `?${queryString}`
    }

    this.ws = new WebSocket(wsUrl)

    this.ws.onopen = () => {
      this.reconnectAttempts = 0
      this.onConnect()
    }

    let historyState = {
      loading: false,
      totalSize: 0,
      totalChunks: 0,
      loadedChunks: 0,
    }

    this.ws.onmessage = (event) => {
      try {
        const msg: TerminalMessage = JSON.parse(event.data)
        
        // Handle special message types
        if (msg.type === 'session' && msg.session_id) {
          this.sessionId = msg.session_id
          this.onSessionId?.(msg.session_id)
          return
        }
        
        if (msg.type === 'history_start') {
          historyState = {
            loading: true,
            totalSize: msg.total_size || 0,
            totalChunks: msg.total_chunks || 0,
            loadedChunks: 0,
          }
          this.onHistoryStart?.(msg.total_size || 0, msg.total_chunks || 0)
          this.onHistoryProgress?.({
            ...historyState,
            percent: 0,
          })
          return
        }
        
        if (msg.type === 'history' && msg.data) {
          historyState.loadedChunks++
          const percent = historyState.totalChunks > 0 
            ? Math.round((historyState.loadedChunks / historyState.totalChunks) * 100)
            : 0
          this.onHistoryChunk?.(msg.data, msg.chunk_index || 0, msg.total_chunks || 0)
          this.onHistoryProgress?.({
            ...historyState,
            percent,
          })
          // Also send as output for terminal to display
          this.onMessage({ type: 'output', data: msg.data })
          return
        }
        
        if (msg.type === 'history_end') {
          historyState.loading = false
          this.onHistoryEnd?.()
          this.onHistoryProgress?.({
            ...historyState,
            loading: false,
            percent: 100,
          })
          return
        }

        // Handle monitoring status updates
        if (msg.type === 'monitoring_status' && msg.monitoring) {
          this.onMonitoringStatus?.(msg.monitoring)
          return
        }

        // Handle task updates
        if (msg.type === 'task_update' && msg.task) {
          this.onTaskUpdate?.(msg.task as unknown as TaskUpdateMessage)
          return
        }

        // Handle strategy triggered events
        if (msg.type === 'strategy_triggered' && msg.strategy) {
          this.onStrategyTriggered?.(msg.strategy as unknown as StrategyTriggeredMessage)
          return
        }
        
        this.onMessage(msg)
      } catch {
        // Handle raw text messages
        this.onMessage({ type: 'output', data: event.data })
      }
    }

    this.ws.onclose = () => {
      this.onDisconnect()
      // Don't reconnect if:
      // - We manually disconnected (maxReconnectAttempts = 0)
      // - Server returned 404 (container not found) - code 1006 with specific error
      // - Server returned 401 (unauthorized)
      if (this.maxReconnectAttempts > 0) {
        this.attemptReconnect()
      }
    }

    this.ws.onerror = () => {
      // Check if this might be a 404/401 error by trying to fetch container status
      this.checkContainerExists().then(exists => {
        if (!exists) {
          // Container doesn't exist, stop reconnecting
          this.maxReconnectAttempts = 0
          this.onError('Container not found or deleted')
        } else {
          this.onError('WebSocket connection error')
        }
      })
    }
  }

  private async checkContainerExists(): Promise<boolean> {
    try {
      const response = await fetch(`/api/containers/${this.containerId}`, {
        credentials: 'include'
      })
      return response.ok
    } catch {
      return false
    }
  }

  private async attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      // Check if container still exists before reconnecting
      const exists = await this.checkContainerExists()
      if (!exists) {
        this.maxReconnectAttempts = 0
        this.onError('Container not found or deleted')
        return
      }
      
      this.reconnectAttempts++
      const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1)
      setTimeout(() => this.connect(), delay)
    } else {
      this.onError('Max reconnection attempts reached')
    }
  }

  send(data: string) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      const msg: TerminalMessage = { type: 'input', data }
      this.ws.send(JSON.stringify(msg))
    }
  }

  resize(cols: number, rows: number) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      const msg: TerminalMessage = { type: 'resize', cols, rows }
      this.ws.send(JSON.stringify(msg))
    }
  }

  disconnect() {
    this.maxReconnectAttempts = 0 // Prevent reconnection
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }

  // Close session permanently (user manually closed the tab)
  closeSession() {
    if (this.ws?.readyState === WebSocket.OPEN && this.sessionId) {
      const msg: TerminalMessage = { type: 'close', session_id: this.sessionId }
      this.ws.send(JSON.stringify(msg))
    }
    this.disconnect()
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }

  getSessionId(): string | null {
    return this.sessionId
  }

  setSessionId(sessionId: string) {
    this.sessionId = sessionId
  }
}
