export interface TerminalMessage {
  type: 'input' | 'output' | 'resize' | 'error' | 'ping' | 'pong'
  data?: string
  cols?: number
  rows?: number
  error?: string
}

export class TerminalWebSocket {
  private ws: WebSocket | null = null
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 1000
  private containerId: string
  private onMessage: (msg: TerminalMessage) => void
  private onConnect: () => void
  private onDisconnect: () => void
  private onError: (error: string) => void

  constructor(
    containerId: string,
    callbacks: {
      onMessage: (msg: TerminalMessage) => void
      onConnect: () => void
      onDisconnect: () => void
      onError: (error: string) => void
    }
  ) {
    this.containerId = containerId
    this.onMessage = callbacks.onMessage
    this.onConnect = callbacks.onConnect
    this.onDisconnect = callbacks.onDisconnect
    this.onError = callbacks.onError
  }

  connect() {
    const token = localStorage.getItem('token')
    if (!token) {
      this.onError('No authentication token')
      return
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${window.location.host}/api/ws/terminal/${this.containerId}?token=${token}`

    this.ws = new WebSocket(wsUrl)

    this.ws.onopen = () => {
      this.reconnectAttempts = 0
      this.onConnect()
    }

    this.ws.onmessage = (event) => {
      try {
        const msg: TerminalMessage = JSON.parse(event.data)
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
}
