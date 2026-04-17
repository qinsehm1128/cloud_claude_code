import { describe, it, expect, vi } from 'vitest'
import { TerminalWebSocket } from '../../src/services/websocket'

type WebSocketHolder = {
  ws: WebSocket | null
}

function setWebSocket(instance: TerminalWebSocket, socket: WebSocket | null): void {
  ;(instance as unknown as WebSocketHolder).ws = socket
}

function getWebSocket(instance: TerminalWebSocket): WebSocket | null {
  return (instance as unknown as WebSocketHolder).ws
}

function createSocketMock(readyState: number = WebSocket.OPEN): {
  socket: WebSocket
  close: ReturnType<typeof vi.fn>
  send: ReturnType<typeof vi.fn>
} {
  const close = vi.fn()
  const send = vi.fn()

  const socket = {
    readyState,
    close,
    send,
  } as unknown as WebSocket

  return { socket, close, send }
}

function createTerminalWebSocket(sessionId?: string): TerminalWebSocket {
  return new TerminalWebSocket(
    'container-1',
    {
      onMessage: vi.fn(),
      onConnect: vi.fn(),
      onDisconnect: vi.fn(),
      onError: vi.fn(),
    },
    sessionId
  )
}

describe('TerminalWebSocket disconnect and closeSession', () => {
  it('disconnect should close current websocket and clear instance reference', () => {
    const client = createTerminalWebSocket('session-123')
    const { socket, close, send } = createSocketMock()
    setWebSocket(client, socket)

    client.disconnect()

    expect(close).toHaveBeenCalledTimes(1)
    expect(send).not.toHaveBeenCalled()
    expect(getWebSocket(client)).toBeNull()
  })

  it('disconnect should be safe when websocket does not exist', () => {
    const client = createTerminalWebSocket('session-123')

    expect(() => client.disconnect()).not.toThrow()
    expect(getWebSocket(client)).toBeNull()
  })

  it('closeSession should keep sending close message with current session id', () => {
    const client = createTerminalWebSocket('session-123')
    const { socket, close, send } = createSocketMock()
    setWebSocket(client, socket)

    client.closeSession()

    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith(
      JSON.stringify({
        type: 'close',
        session_id: 'session-123',
      })
    )
    expect(close).toHaveBeenCalledTimes(1)
    expect(getWebSocket(client)).toBeNull()
  })

  it('closeSession should not send close message when session id is missing', () => {
    const client = createTerminalWebSocket()
    const { socket, close, send } = createSocketMock()
    setWebSocket(client, socket)

    client.closeSession()

    expect(send).not.toHaveBeenCalled()
    expect(close).toHaveBeenCalledTimes(1)
    expect(getWebSocket(client)).toBeNull()
  })
})

describe('TerminalWebSocket conversation mode', () => {
  it('connectToConversation should use /api/ws/conversations/:id endpoint', () => {
    const originalWebSocket = globalThis.WebSocket
    const webSocketCtor = vi.fn(function WebSocketMock(this: unknown, url: string) {
      ;(this as { url: string }).url = url
      ;(this as { readyState: number }).readyState = originalWebSocket.CONNECTING
      ;(this as { close: () => void }).close = vi.fn()
      ;(this as { send: (payload: string) => void }).send = vi.fn()
    } as unknown as typeof WebSocket)
    ;(webSocketCtor as unknown as typeof WebSocket).OPEN = originalWebSocket.OPEN
    ;(webSocketCtor as unknown as typeof WebSocket).CONNECTING = originalWebSocket.CONNECTING
    ;(webSocketCtor as unknown as typeof WebSocket).CLOSING = originalWebSocket.CLOSING
    ;(webSocketCtor as unknown as typeof WebSocket).CLOSED = originalWebSocket.CLOSED

    vi.stubGlobal('WebSocket', webSocketCtor)

    const client = createTerminalWebSocket('session-123')
    client.connectToConversation(77)

    expect(webSocketCtor).toHaveBeenCalledTimes(1)
    expect(webSocketCtor).toHaveBeenCalledWith(
      expect.stringContaining('/api/ws/conversations/77')
    )

    vi.stubGlobal('WebSocket', originalWebSocket)
  })

  it('connectToConversation should send start message when startNew is true', () => {
    const client = createTerminalWebSocket()
    const { socket, send } = createSocketMock()
    const originalWebSocket = globalThis.WebSocket
    ;(socket as unknown as { readyState: number }).readyState = originalWebSocket.OPEN

    const websocketStub = socket as unknown as {
      onopen?: (() => void) | null
      onmessage?: ((event: MessageEvent) => void) | null
      onclose?: (() => void) | null
      onerror?: (() => void) | null
    }

    const webSocketCtor = vi.fn(function WebSocketMock() {
      return websocketStub
    } as unknown as typeof WebSocket)
    ;(webSocketCtor as unknown as typeof WebSocket).OPEN = originalWebSocket.OPEN
    ;(webSocketCtor as unknown as typeof WebSocket).CONNECTING = originalWebSocket.CONNECTING
    ;(webSocketCtor as unknown as typeof WebSocket).CLOSING = originalWebSocket.CLOSING
    ;(webSocketCtor as unknown as typeof WebSocket).CLOSED = originalWebSocket.CLOSED

    vi.stubGlobal('WebSocket', webSocketCtor)

    client.connectToConversation(88, { startNew: true })

    expect(typeof websocketStub.onopen).toBe('function')
    websocketStub.onopen?.()

    expect(send).toHaveBeenCalledWith(JSON.stringify({ type: 'start' }))

    vi.stubGlobal('WebSocket', originalWebSocket)
  })

  it('disconnect should disable reconnect attempts', () => {
    const client = createTerminalWebSocket()
    const { socket } = createSocketMock()
    setWebSocket(client, socket)

    client.disconnect()

    expect((client as unknown as { manualDisconnect: boolean }).manualDisconnect).toBe(true)
  })
})

describe('TerminalWebSocket send and resize', () => {
  it('send should transmit input message when socket is open', () => {
    const client = createTerminalWebSocket()
    const { socket, send } = createSocketMock(WebSocket.OPEN)
    setWebSocket(client, socket)

    client.send('hello')

    expect(send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'input', data: 'hello' })
    )
  })

  it('send should not transmit when socket is not open', () => {
    const client = createTerminalWebSocket()
    const { socket, send } = createSocketMock(WebSocket.CLOSED)
    setWebSocket(client, socket)

    client.send('hello')

    expect(send).not.toHaveBeenCalled()
  })

  it('send should not throw when no socket exists', () => {
    const client = createTerminalWebSocket()

    expect(() => client.send('hello')).not.toThrow()
  })

  it('resize should transmit resize message when socket is open', () => {
    const client = createTerminalWebSocket()
    const { socket, send } = createSocketMock(WebSocket.OPEN)
    setWebSocket(client, socket)

    client.resize(120, 40)

    expect(send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'resize', cols: 120, rows: 40 })
    )
  })

  it('resize should not transmit when socket is closed', () => {
    const client = createTerminalWebSocket()
    const { socket, send } = createSocketMock(WebSocket.CLOSED)
    setWebSocket(client, socket)

    client.resize(80, 24)

    expect(send).not.toHaveBeenCalled()
  })
})

describe('TerminalWebSocket state accessors', () => {
  it('isConnected should return true when socket is OPEN', () => {
    const client = createTerminalWebSocket()
    const { socket } = createSocketMock(WebSocket.OPEN)
    setWebSocket(client, socket)

    expect(client.isConnected()).toBe(true)
  })

  it('isConnected should return false when socket is CLOSED', () => {
    const client = createTerminalWebSocket()
    const { socket } = createSocketMock(WebSocket.CLOSED)
    setWebSocket(client, socket)

    expect(client.isConnected()).toBe(false)
  })

  it('isConnected should return false when socket is null', () => {
    const client = createTerminalWebSocket()

    expect(client.isConnected()).toBe(false)
  })

  it('getSessionId should return null by default', () => {
    const client = createTerminalWebSocket()

    expect(client.getSessionId()).toBeNull()
  })

  it('getSessionId should return constructor session id', () => {
    const client = createTerminalWebSocket('my-session')

    expect(client.getSessionId()).toBe('my-session')
  })

  it('setSessionId should update session id', () => {
    const client = createTerminalWebSocket()
    client.setSessionId('new-session-id')

    expect(client.getSessionId()).toBe('new-session-id')
  })
})

describe('TerminalWebSocket container mode URL', () => {
  it('connect should use /api/ws/terminal/:id endpoint', () => {
    const originalWebSocket = globalThis.WebSocket
    const webSocketCtor = vi.fn(function WebSocketMock(this: unknown, url: string) {
      ;(this as { url: string }).url = url
      ;(this as { readyState: number }).readyState = originalWebSocket.CONNECTING
      ;(this as { close: () => void }).close = vi.fn()
      ;(this as { send: (payload: string) => void }).send = vi.fn()
    } as unknown as typeof WebSocket)
    ;(webSocketCtor as unknown as typeof WebSocket).OPEN = originalWebSocket.OPEN
    ;(webSocketCtor as unknown as typeof WebSocket).CONNECTING = originalWebSocket.CONNECTING
    ;(webSocketCtor as unknown as typeof WebSocket).CLOSING = originalWebSocket.CLOSING
    ;(webSocketCtor as unknown as typeof WebSocket).CLOSED = originalWebSocket.CLOSED

    vi.stubGlobal('WebSocket', webSocketCtor)

    const client = createTerminalWebSocket('session-abc')
    client.connect()

    expect(webSocketCtor).toHaveBeenCalledTimes(1)
    const url = webSocketCtor.mock.calls[0][0] as string
    expect(url).toContain('/api/ws/terminal/container-1')
    expect(url).toContain('session=session-abc')

    vi.stubGlobal('WebSocket', originalWebSocket)
  })
})

