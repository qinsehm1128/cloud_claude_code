import { useCallback, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { TerminalWebSocket } from '@/services/websocket'

interface UseAuxiliaryKeyboardProps {
  terminal: Terminal | null
  websocket: TerminalWebSocket | null
}

interface UseAuxiliaryKeyboardReturn {
  executeCommand: (command: string) => void
  handleScroll: (direction: 'up' | 'down') => void
  handleScrollDial: (deltaY: number) => void
  activeModifiers: Set<string>
  toggleModifier: (modifier: 'ctrl' | 'shift') => void
  sendModifiedKey: (key: string) => void
}

export function useAuxiliaryKeyboard({
  terminal,
  websocket
}: UseAuxiliaryKeyboardProps): UseAuxiliaryKeyboardReturn {
  const [activeModifiers, setActiveModifiers] = useState<Set<string>>(new Set())
  const scrollAccumulatorRef = useRef<number>(0)

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

  const handleScrollDial = useCallback((deltaY: number) => {
    if (!terminal) return

    scrollAccumulatorRef.current += deltaY
    const threshold = 5
    if (Math.abs(scrollAccumulatorRef.current) >= threshold) {
      const lines = Math.round(scrollAccumulatorRef.current / threshold)
      terminal.scrollLines(-lines)
      scrollAccumulatorRef.current = 0
    }
  }, [terminal])

  const toggleModifier = useCallback((modifier: 'ctrl' | 'shift') => {
    setActiveModifiers(prev => {
      const next = new Set(prev)
      if (next.has(modifier)) {
        next.delete(modifier)
      } else {
        next.add(modifier)
      }
      return next
    })
  }, [])

  const sendModifiedKey = useCallback((key: string) => {
    if (!websocket) return

    const hasCtrl = activeModifiers.has('ctrl')
    const hasShift = activeModifiers.has('shift')

    let data: string

    if (hasCtrl) {
      // Ctrl + a-z: send control code (charCode - 96)
      const lower = key.toLowerCase()
      if (lower.length === 1 && lower >= 'a' && lower <= 'z') {
        const code = lower.charCodeAt(0) - 96
        data = String.fromCharCode(code)
      } else {
        // Non-alpha keys with Ctrl: just send the key as-is
        data = key
      }
    } else if (hasShift) {
      // Shift modifier: send uppercase or shifted key
      data = key.toUpperCase()
    } else {
      data = key
    }

    websocket.send(data)
    setActiveModifiers(new Set())
  }, [websocket, activeModifiers])

  return {
    executeCommand,
    handleScroll,
    handleScrollDial,
    activeModifiers,
    toggleModifier,
    sendModifiedKey
  }
}
