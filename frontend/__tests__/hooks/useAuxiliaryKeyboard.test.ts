import { renderHook } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useAuxiliaryKeyboard } from '@/hooks/useAuxiliaryKeyboard'

const mockSend = vi.fn()
const mockScrollLines = vi.fn()

function createMockTerminal() {
  return {
    scrollLines: mockScrollLines,
  } as unknown as import('@xterm/xterm').Terminal
}

function createMockWebSocket() {
  return {
    send: mockSend,
  } as unknown as import('@/services/websocket').TerminalWebSocket
}

describe('useAuxiliaryKeyboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns executeCommand and handleScroll functions', () => {
    const { result } = renderHook(() =>
      useAuxiliaryKeyboard({
        terminal: createMockTerminal(),
        websocket: createMockWebSocket(),
      })
    )
    expect(typeof result.current.executeCommand).toBe('function')
    expect(typeof result.current.handleScroll).toBe('function')
  })

  it('executeCommand sends command via websocket', () => {
    const { result } = renderHook(() =>
      useAuxiliaryKeyboard({
        terminal: createMockTerminal(),
        websocket: createMockWebSocket(),
      })
    )
    result.current.executeCommand('ls -la\n')
    expect(mockSend).toHaveBeenCalledWith('ls -la\n')
  })

  it('executeCommand does nothing when websocket is null', () => {
    const { result } = renderHook(() =>
      useAuxiliaryKeyboard({
        terminal: createMockTerminal(),
        websocket: null,
      })
    )
    result.current.executeCommand('ls\n')
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('executeCommand does nothing when command is empty', () => {
    const { result } = renderHook(() =>
      useAuxiliaryKeyboard({
        terminal: createMockTerminal(),
        websocket: createMockWebSocket(),
      })
    )
    result.current.executeCommand('')
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('handleScroll scrolls terminal up by 10 lines', () => {
    const { result } = renderHook(() =>
      useAuxiliaryKeyboard({
        terminal: createMockTerminal(),
        websocket: createMockWebSocket(),
      })
    )
    result.current.handleScroll('up')
    expect(mockScrollLines).toHaveBeenCalledWith(-10)
  })

  it('handleScroll scrolls terminal down by 10 lines', () => {
    const { result } = renderHook(() =>
      useAuxiliaryKeyboard({
        terminal: createMockTerminal(),
        websocket: createMockWebSocket(),
      })
    )
    result.current.handleScroll('down')
    expect(mockScrollLines).toHaveBeenCalledWith(10)
  })

  it('handleScroll does nothing when terminal is null', () => {
    const { result } = renderHook(() =>
      useAuxiliaryKeyboard({
        terminal: null,
        websocket: createMockWebSocket(),
      })
    )
    result.current.handleScroll('up')
    expect(mockScrollLines).not.toHaveBeenCalled()
  })
})
