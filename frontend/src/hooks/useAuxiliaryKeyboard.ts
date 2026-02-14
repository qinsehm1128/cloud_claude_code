import { useCallback } from 'react'
import { Terminal } from '@xterm/xterm'
import { TerminalWebSocket } from '@/services/websocket'

interface UseAuxiliaryKeyboardProps {
  terminal: Terminal | null
  websocket: TerminalWebSocket | null
}

interface UseAuxiliaryKeyboardReturn {
  executeCommand: (command: string) => void
  handleScroll: (direction: 'up' | 'down') => void
}

export function useAuxiliaryKeyboard({
  terminal,
  websocket
}: UseAuxiliaryKeyboardProps): UseAuxiliaryKeyboardReturn {
  const executeCommand = useCallback((command: string) => {
    if (!command || !websocket) {
      return
    }

    websocket.send(command)
  }, [websocket])

  const handleScroll = useCallback((direction: 'up' | 'down') => {
    if (!terminal) {
      return
    }

    const scrollAmount = direction === 'up' ? -10 : 10
    terminal.scrollLines(scrollAmount)
  }, [terminal])

  return {
    executeCommand,
    handleScroll
  }
}
