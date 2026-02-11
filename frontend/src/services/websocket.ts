export interface TerminalMessage {
  type: 'input' | 'output' | 'resize' | 'error' | 'ping' | 'pong' | 'history' | 'history_start' | 'history_end' | 'session' | 'close' | 'start' | 'monitoring_status' | 'task_update' | 'strategy_triggered'
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

export interface ConversationConnectOptions {
  startNew?: boolean
}

type WebSocketTarget = 'container' | 'conversation'

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
  private targetType: WebSocketTarget = 'container'
  private targetId: string
  private startSessionOnConnect = false
  private manualDisconnect = false
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
    this.targetId = containerId
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
    this.targetType = 'container'
    this.targetId = this.containerId
    this.startSessionOnConnect = false
    this.manualDisconnect = false
    this.connectInternal()
  }

  connectToConversation(conversationId: string | number, options: ConversationConnectOptions = {}) {
    this.targetType = 'conversation'
    this.targetId = String(conversationId)
    this.startSessionOnConnect = Boolean(options.startNew)
    this.manualDisconnect = false
    this.connectInternal()
  }

  private connectInternal() {
    const wsUrl = this.buildWebSocketUrl()

    this.ws = new WebSocket(wsUrl)

    this.ws.onopen = () => {
      this.reconnectAttempts = 0
      this.onConnect()

      if (this.targetType === 'conversation' && this.startSessionOnConnect) {
        this.sendStartSessionMessage()
      }
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

        if (msg.type === 'monitoring_status' && msg.monitoring) {
          this.onMonitoringStatus?.(msg.monitoring)
          return
        }

        if (msg.type === 'task_update' && msg.task) {
          this.onTaskUpdate?.(msg.task as unknown as TaskUpdateMessage)
          return
        }

        if (msg.type === 'strategy_triggered' && msg.strategy) {
          this.onStrategyTriggered?.(msg.strategy as unknown as StrategyTriggeredMessage)
          return
        }

        this.onMessage(msg)
      } catch {
        this.onMessage({ type: 'output', data: event.data })
      }
    }

    this.ws.onclose = () => {
      this.onDisconnect()
      if (!this.manualDisconnect && this.maxReconnectAttempts > 0) {
        this.attemptReconnect()
      }
    }

    this.ws.onerror = () => {
      this.checkCurrentTarget().then((targetState) => {
        if (!targetState.exists) {
          this.maxReconnectAttempts = 0
          this.onError(targetState.reason)
        } else {
          this.onError('WebSocket connection error')
        }
      })
    }
  }

  private buildWebSocketUrl(): string {
    const token = getCookie('cc_token')
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'

    const path = this.targetType === 'conversation'
      ? `/api/ws/conversations/${this.targetId}`
      : `/api/ws/terminal/${this.containerId}`

    const params = new URLSearchParams()
    if (token) {
      params.set('token', token)
    }

    if (this.targetType === 'container' && this.sessionId) {
      params.set('session', this.sessionId)
    }

    const queryString = params.toString()
    const baseUrl = `${protocol}//${window.location.host}${path}`

    return queryString ? `${baseUrl}?${queryString}` : baseUrl
  }

  private sendStartSessionMessage() {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      return
    }

    const startMessage: TerminalMessage = { type: 'start' }
    this.ws.send(JSON.stringify(startMessage))
    this.startSessionOnConnect = false
  }

  private async checkCurrentTarget(): Promise<{ exists: boolean; reason: string }> {
    if (this.targetType === 'conversation') {
      return this.checkConversationExists()
    }

    const containerExists = await this.checkContainerExists()
    return {
      exists: containerExists,
      reason: 'Container not found or deleted',
    }
  }

  private async checkConversationExists(): Promise<{ exists: boolean; reason: string }> {
    try {
      const response = await fetch(`/api/containers/${this.containerId}/conversations`, {
        credentials: 'include',
      })

      if (response.status === 400) {
        return {
          exists: false,
          reason: 'Container is not running',
        }
      }

      if (!response.ok) {
        return {
          exists: false,
          reason: 'Conversation not found',
        }
      }

      const conversations = await response.json() as Array<{ id?: string | number }>
      const matchedConversation = conversations.some((conversation) => String(conversation.id) === this.targetId)

      return {
        exists: matchedConversation,
        reason: matchedConversation ? '' : 'Conversation not found',
      }
    } catch {
      return {
        exists: true,
        reason: '',
      }
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
      const targetState = await this.checkCurrentTarget()
      if (!targetState.exists) {
        this.maxReconnectAttempts = 0
        this.onError(targetState.reason)
        return
      }

      this.reconnectAttempts++
      const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1)
      setTimeout(() => this.connectInternal(), delay)
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

  disconnect(): void {
    this.manualDisconnect = true
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }

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
