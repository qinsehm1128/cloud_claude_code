import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { HeadlessResponseType } from '../../src/types/headless'

type MessageHandler = (type: HeadlessResponseType, payload: unknown) => void

const mockWs = vi.hoisted(() => {
  type MockInstance = {
    connect: () => Promise<void>
    disconnect: () => void
    isConnected: () => boolean
    setMessageHandler: (handler: MessageHandler) => void
    setConnectionHandlers: (handlers: {
      onConnect?: () => void
      onDisconnect?: (code: number, reason: string) => void
      onError?: (error: Event) => void
    }) => void
    startSession: ReturnType<typeof vi.fn>
    sendPrompt: ReturnType<typeof vi.fn>
    cancelExecution: ReturnType<typeof vi.fn>
    stopSession: ReturnType<typeof vi.fn>
    loadMoreHistory: ReturnType<typeof vi.fn>
    switchMode: ReturnType<typeof vi.fn>
    deleteQueuedTurn: ReturnType<typeof vi.fn>
    editQueuedTurn: ReturnType<typeof vi.fn>
    emit: (type: HeadlessResponseType, payload: unknown) => void
  }

  return {
    instance: null as MockInstance | null,
    createInstance() {
      let connected = false
      let messageHandler: MessageHandler | null = null
      let onConnect: (() => void) | undefined
      let onDisconnect: ((code: number, reason: string) => void) | undefined

      const instance: MockInstance = {
        async connect() {
          connected = true
          onConnect?.()
        },
        disconnect() {
          const wasConnected = connected
          connected = false
          if (wasConnected) {
            onDisconnect?.(1000, 'manual')
          }
        },
        isConnected() {
          return connected
        },
        setMessageHandler(handler) {
          messageHandler = handler
        },
        setConnectionHandlers(handlers) {
          onConnect = handlers.onConnect
          onDisconnect = handlers.onDisconnect
        },
        startSession: vi.fn(),
        sendPrompt: vi.fn(),
        cancelExecution: vi.fn(),
        stopSession: vi.fn(),
        loadMoreHistory: vi.fn(),
        switchMode: vi.fn(),
        deleteQueuedTurn: vi.fn(),
        editQueuedTurn: vi.fn(),
        emit(type, payload) {
          messageHandler?.(type, payload)
        },
      }

      return instance
    },
  }
})

vi.mock('../../src/services/headlessWebsocket', async () => {
  const actual = await vi.importActual<typeof import('../../src/services/headlessWebsocket')>('../../src/services/headlessWebsocket')

  return {
    ...actual,
    HeadlessWebSocketService: vi.fn(function MockHeadlessWebSocketService() {
      const instance = mockWs.createInstance()
      mockWs.instance = instance
      return instance
    }),
  }
})

import { useHeadlessSession } from '../../src/hooks/useHeadlessSession'

describe('useHeadlessSession', () => {
  beforeEach(() => {
    mockWs.instance?.disconnect()
    mockWs.instance = null
    vi.clearAllMocks()
  })

  it('should dedupe duplicate live events from the same turn', async () => {
    const { result } = renderHook(() =>
      useHeadlessSession({ containerId: 1, autoConnect: false })
    )

    await act(async () => {
      await result.current.connectToContainer(1)
    })

    const eventPayload = {
      type: 'assistant' as const,
      session_id: 'session-1',
      message: {
        content: [{ type: 'text' as const, text: 'hello from claude' }],
      },
    }

    act(() => {
      mockWs.instance?.emit('event', eventPayload)
      mockWs.instance?.emit('event', eventPayload)
    })

    expect(result.current.currentTurnEvents).toHaveLength(1)
    expect(result.current.currentTurnEvents[0]?.message?.content?.[0]?.text).toBe('hello from claude')
  })

  it('should reset dedupe state after turn_complete', async () => {
    const { result } = renderHook(() =>
      useHeadlessSession({ containerId: 1, autoConnect: false })
    )

    await act(async () => {
      await result.current.connectToContainer(1)
    })

    const eventPayload = {
      type: 'assistant' as const,
      session_id: 'session-2',
      message: {
        content: [{ type: 'text' as const, text: 'same payload next turn' }],
      },
    }

    act(() => {
      mockWs.instance?.emit('event', eventPayload)
      mockWs.instance?.emit('turn_complete', {
        turn_id: 1,
        turn_index: 1,
        input_tokens: 0,
        output_tokens: 0,
        cost_usd: 0,
        duration_ms: 1,
        state: 'completed',
      })
    })

    expect(result.current.turns).toHaveLength(1)
    expect(result.current.currentTurnEvents).toHaveLength(0)

    act(() => {
      mockWs.instance?.emit('event', eventPayload)
    })

    expect(result.current.turns).toHaveLength(1)
    expect(result.current.currentTurnEvents).toHaveLength(1)
    expect(result.current.turns[0]?.turn_index).toBe(1)
  })

  it('should clear session-only state after no_session while keeping history', async () => {
    const { result } = renderHook(() =>
      useHeadlessSession({ containerId: 1, autoConnect: false })
    )

    await act(async () => {
      await result.current.connectToContainer(1)
    })

    act(() => {
      mockWs.instance?.emit('session_info', {
        session_id: 'session-3',
        state: 'running',
        conversation_id: 9,
        current_turn_id: 12,
      })
      mockWs.instance?.emit('history', {
        turns: [
          {
            id: 1,
            turn_index: 1,
            user_prompt: 'hello',
            assistant_response: 'world',
            state: 'completed',
            prompt_source: 'user',
            created_at: new Date().toISOString(),
          },
        ],
        has_more: false,
      })
      mockWs.instance?.emit('event', {
        type: 'assistant' as const,
        message: {
          content: [{ type: 'text' as const, text: 'live output' }],
        },
      })
      mockWs.instance?.emit('queue_update', {
        queued_turns: [{ turn_id: 2, turn_index: 2, prompt: 'queued', source: 'user', state: 'pending' }],
      })
      mockWs.instance?.emit('no_session', { conversation_id: 9 })
    })

    expect(result.current.sessionId).toBeNull()
    expect(result.current.state).toBe('idle')
    expect(result.current.currentTurnId).toBeNull()
    expect(result.current.currentTurnEvents).toHaveLength(0)
    expect(result.current.queuedTurns).toHaveLength(0)
    expect(result.current.turns).toHaveLength(1)
  })

  it('should stop the exact active session id', async () => {
    const { result } = renderHook(() =>
      useHeadlessSession({ containerId: 1, autoConnect: false })
    )

    await act(async () => {
      await result.current.connectToContainer(1)
    })

    act(() => {
      mockWs.instance?.emit('session_info', {
        session_id: 'session-precise-stop',
        state: 'idle',
        conversation_id: 33,
      })
    })

    act(() => {
      result.current.stopSession()
    })

    expect(mockWs.instance?.stopSession).toHaveBeenCalledWith('session-precise-stop')
  })
})
