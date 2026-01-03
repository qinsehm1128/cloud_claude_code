import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Button, message, Spin, Alert } from 'antd'
import { ArrowLeftOutlined } from '@ant-design/icons'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import { WebLinksAddon } from 'xterm-addon-web-links'
import { TerminalWebSocket } from '../services/websocket'
import { containerApi } from '../services/api'
import 'xterm/css/xterm.css'

interface Container {
  id: number
  name: string
  status: string
}

export default function ContainerTerminal() {
  const { containerId } = useParams<{ containerId: string }>()
  const navigate = useNavigate()
  const terminalRef = useRef<HTMLDivElement>(null)
  const [terminal, setTerminal] = useState<Terminal | null>(null)
  const [ws, setWs] = useState<TerminalWebSocket | null>(null)
  const [container, setContainer] = useState<Container | null>(null)
  const [loading, setLoading] = useState(true)
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch container info
  useEffect(() => {
    const fetchContainer = async () => {
      if (!containerId) return
      try {
        const response = await containerApi.get(parseInt(containerId))
        setContainer(response.data)
        if (response.data.status !== 'running') {
          setError('Container is not running')
        }
      } catch (err) {
        setError('Failed to fetch container information')
      } finally {
        setLoading(false)
      }
    }
    fetchContainer()
  }, [containerId])

  // Initialize terminal
  useEffect(() => {
    if (!terminalRef.current || !container || container.status !== 'running') return

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
        cursor: '#d4d4d4',
      },
    })

    const fitAddon = new FitAddon()
    const webLinksAddon = new WebLinksAddon()

    term.loadAddon(fitAddon)
    term.loadAddon(webLinksAddon)
    term.open(terminalRef.current)
    fitAddon.fit()

    setTerminal(term)

    // Handle window resize
    const handleResize = () => {
      fitAddon.fit()
    }
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      term.dispose()
    }
  }, [container])

  // Initialize WebSocket connection
  useEffect(() => {
    if (!terminal || !containerId || !container || container.status !== 'running') return

    const websocket = new TerminalWebSocket(containerId, {
      onMessage: (msg) => {
        if (msg.type === 'output' && msg.data) {
          terminal.write(msg.data)
        } else if (msg.type === 'error' && msg.error) {
          message.error(msg.error)
        }
      },
      onConnect: () => {
        setConnected(true)
        terminal.write('\r\n\x1b[32mConnected to container terminal\x1b[0m\r\n\r\n')
        // Send initial resize
        websocket.resize(terminal.cols, terminal.rows)
      },
      onDisconnect: () => {
        setConnected(false)
        terminal.write('\r\n\x1b[31mDisconnected from container\x1b[0m\r\n')
      },
      onError: (err) => {
        message.error(err)
      },
    })

    websocket.connect()
    setWs(websocket)

    // Handle terminal input
    const inputDisposable = terminal.onData((data) => {
      websocket.send(data)
    })

    // Handle terminal resize
    const resizeDisposable = terminal.onResize(({ cols, rows }) => {
      websocket.resize(cols, rows)
    })

    return () => {
      inputDisposable.dispose()
      resizeDisposable.dispose()
      websocket.disconnect()
    }
  }, [terminal, containerId, container])

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 50 }}>
        <Spin size="large" />
      </div>
    )
  }

  if (error) {
    return (
      <div>
        <Button
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate('/')}
          style={{ marginBottom: 16 }}
        >
          Back to Dashboard
        </Button>
        <Alert message={error} type="error" showIcon />
      </div>
    )
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Button
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate('/')}
        >
          Back to Dashboard
        </Button>
        <div>
          <span style={{ marginRight: 16 }}>
            <strong>Container:</strong> {container?.name}
          </span>
          <span
            style={{
              color: connected ? '#52c41a' : '#ff4d4f',
              fontWeight: 'bold',
            }}
          >
            {connected ? '● Connected' : '○ Disconnected'}
          </span>
        </div>
      </div>
      <div
        ref={terminalRef}
        style={{
          flex: 1,
          backgroundColor: '#1e1e1e',
          borderRadius: 4,
          padding: 8,
          minHeight: 400,
        }}
      />
    </div>
  )
}
