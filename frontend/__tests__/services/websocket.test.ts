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
