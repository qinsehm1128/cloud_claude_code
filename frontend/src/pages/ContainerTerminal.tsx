import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Button, message, Spin, Alert, Tabs, Splitter } from 'antd'
import { ArrowLeftOutlined, PlusOutlined, CloseOutlined } from '@ant-design/icons'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import { WebLinksAddon } from 'xterm-addon-web-links'
import { TerminalWebSocket } from '../services/websocket'
import { containerApi } from '../services/api'
import FileBrowser from '../components/FileManager/FileBrowser'
import 'xterm/css/xterm.css'

interface Container {
  id: number
  name: string
  status: string
  init_status: string
  work_dir?: string
}

interface TerminalTab {
  key: string
  label: string
  terminal: Terminal | null
  ws: TerminalWebSocket | null
  fitAddon: FitAddon | null
  connected: boolean
}

let tabCounter = 0

export default function ContainerTerminal() {
  const { containerId } = useParams<{ containerId: string }>()
  const navigate = useNavigate()
  const terminalRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const [container, setContainer] = useState<Container | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tabs, setTabs] = useState<TerminalTab[]>([])
  const [activeKey, setActiveKey] = useState<string>('')
  const [showFileBrowser, setShowFileBrowser] = useState(true)

  // Fetch container info
  useEffect(() => {
    const fetchContainer = async () => {
      if (!containerId) return
      try {
        const response = await containerApi.get(parseInt(containerId))
        setContainer(response.data)
        if (response.data.status !== 'running') {
          setError('Container is not running')
        } else if (response.data.init_status !== 'ready') {
          setError('Container initialization not complete')
        }
      } catch (err) {
        setError('Failed to fetch container information')
      } finally {
        setLoading(false)
      }
    }
    fetchContainer()
  }, [containerId])

  // Create initial terminal tab
  useEffect(() => {
    if (container && container.status === 'running' && container.init_status === 'ready' && tabs.length === 0) {
      addNewTab()
    }
  }, [container])

  const addNewTab = useCallback(() => {
    tabCounter++
    const newKey = `terminal-${tabCounter}`
    const newTab: TerminalTab = {
      key: newKey,
      label: `Terminal ${tabCounter}`,
      terminal: null,
      ws: null,
      fitAddon: null,
      connected: false,
    }
    setTabs(prev => [...prev, newTab])
    setActiveKey(newKey)
  }, [])

  const removeTab = useCallback((targetKey: string) => {
    const tab = tabs.find(t => t.key === targetKey)
    if (tab) {
      tab.ws?.disconnect()
      tab.terminal?.dispose()
    }

    const newTabs = tabs.filter(t => t.key !== targetKey)
    setTabs(newTabs)

    if (activeKey === targetKey && newTabs.length > 0) {
      setActiveKey(newTabs[newTabs.length - 1].key)
    }
  }, [tabs, activeKey])

  // Initialize terminal for active tab
  useEffect(() => {
    if (!activeKey || !container || !containerId) return

    const tab = tabs.find(t => t.key === activeKey)
    if (!tab || tab.terminal) return

    // Wait for DOM element
    const initTerminal = () => {
      const element = terminalRefs.current.get(activeKey)
      if (!element) {
        setTimeout(initTerminal, 100)
        return
      }

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
      term.open(element)
      fitAddon.fit()

      // Create WebSocket connection
      const ws = new TerminalWebSocket(containerId, {
        onMessage: (msg) => {
          if (msg.type === 'output' && msg.data) {
            term.write(msg.data)
          } else if (msg.type === 'error' && msg.error) {
            message.error(msg.error)
          }
        },
        onConnect: () => {
          setTabs(prev => prev.map(t => 
            t.key === activeKey ? { ...t, connected: true } : t
          ))
          term.write('\r\n\x1b[32mConnected to container terminal\x1b[0m\r\n\r\n')
          ws.resize(term.cols, term.rows)
        },
        onDisconnect: () => {
          setTabs(prev => prev.map(t => 
            t.key === activeKey ? { ...t, connected: false } : t
          ))
          term.write('\r\n\x1b[31mDisconnected from container\x1b[0m\r\n')
        },
        onError: (err) => {
          message.error(err)
        },
      })

      ws.connect()

      // Handle terminal input
      term.onData((data) => {
        ws.send(data)
      })

      // Handle terminal resize
      term.onResize(({ cols, rows }) => {
        ws.resize(cols, rows)
      })

      // Update tab
      setTabs(prev => prev.map(t => 
        t.key === activeKey ? { ...t, terminal: term, ws, fitAddon } : t
      ))
    }

    initTerminal()

    return () => {
      // Cleanup handled in removeTab
    }
  }, [activeKey, container, containerId, tabs])

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      tabs.forEach(tab => {
        if (tab.fitAddon && tab.terminal) {
          tab.fitAddon.fit()
        }
      })
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [tabs])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      tabs.forEach(tab => {
        tab.ws?.disconnect()
        tab.terminal?.dispose()
      })
    }
  }, [])

  const setTerminalRef = useCallback((key: string, element: HTMLDivElement | null) => {
    if (element) {
      terminalRefs.current.set(key, element)
    } else {
      terminalRefs.current.delete(key)
    }
  }, [])

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

  const tabItems = tabs.map(tab => ({
    key: tab.key,
    label: (
      <span>
        {tab.label}
        <span
          style={{
            marginLeft: 8,
            color: tab.connected ? '#52c41a' : '#ff4d4f',
          }}
        >
          ●
        </span>
        {tabs.length > 1 && (
          <CloseOutlined
            style={{ marginLeft: 8, fontSize: 12 }}
            onClick={(e) => {
              e.stopPropagation()
              removeTab(tab.key)
            }}
          />
        )}
      </span>
    ),
    children: (
      <div
        ref={(el) => setTerminalRef(tab.key, el)}
        style={{
          height: 'calc(100vh - 200px)',
          backgroundColor: '#1e1e1e',
          borderRadius: 4,
        }}
      />
    ),
  }))

  return (
    <div style={{ height: 'calc(100vh - 112px)' }}>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/')}>
          Back to Dashboard
        </Button>
        <div>
          <span style={{ marginRight: 16 }}>
            <strong>Container:</strong> {container?.name}
          </span>
          <Button 
            type={showFileBrowser ? 'primary' : 'default'}
            onClick={() => setShowFileBrowser(!showFileBrowser)}
            style={{ marginRight: 8 }}
          >
            {showFileBrowser ? 'Hide Files' : 'Show Files'}
          </Button>
          <Button icon={<PlusOutlined />} onClick={addNewTab}>
            New Terminal
          </Button>
        </div>
      </div>

      <Splitter style={{ height: 'calc(100% - 48px)' }}>
        {showFileBrowser && (
          <Splitter.Panel defaultSize="25%" min="15%" max="40%">
            <div style={{ height: '100%', overflow: 'auto', background: '#fff', borderRadius: 4, padding: 8 }}>
              <FileBrowser containerId={parseInt(containerId || '0')} />
            </div>
          </Splitter.Panel>
        )}
        <Splitter.Panel>
          <Tabs
            type="card"
            activeKey={activeKey}
            onChange={setActiveKey}
            items={tabItems}
            style={{ height: '100%' }}
            tabBarExtraContent={
              <Button 
                type="text" 
                icon={<PlusOutlined />} 
                onClick={addNewTab}
                size="small"
              />
            }
          />
        </Splitter.Panel>
      </Splitter>
    </div>
  )
}
