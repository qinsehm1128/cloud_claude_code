export interface TerminalMessage {
  type: 'input' | 'output' | 'resize' | 'error' | 'ping' | 'pong' | 'history' | 'history_start' | 'history_end' | 'session'
  data?: string
  cols?: number
  rows?: number
  error?: string
  session_id?: string
  total_size?: number
  chunk_index?: number
  total_chunks?: number
}

export interface HistoryLoadProgress {
  loading: boolean
  totalSize: number
  totalChunks: number
  loadedChunks: number
  percent: number
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
  }

  connect() {
    const token = localStorage.getItem('token')
    if (!token) {
      this.onError('No authentication token')
      return
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    let wsUrl = `${protocol}//${window.location.host}/api/ws/terminal/${this.containerId}?token=${token}`
    
    // Add session ID for reconnection
    if (this.sessionId) {
      wsUrl += `&session=${this.sessionId}`
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
        
        this.onMessage(msg)
      } catch {
        // Handle raw text messages
        this.onMessage({ type: 'output', data: event.data })
      }
    }

    this.ws.onclose = () => {
      this.onDisconnect()
      this.attemptReconnect()
    }

    this.ws.onerror = () => {
      this.onError('WebSocket connection error')
    }
  }

  private attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
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
