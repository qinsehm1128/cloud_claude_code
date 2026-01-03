import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Button, message, Spin, Alert, Tabs, Drawer, Progress, Tooltip } from 'antd'
import { 
  ArrowLeftOutlined, 
  PlusOutlined, 
  CloseOutlined, 
  FolderOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
} from '@ant-design/icons'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import { WebLinksAddon } from 'xterm-addon-web-links'
import { TerminalWebSocket, HistoryLoadProgress } from '../services/websocket'
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
  sessionId: string | null
  terminal: Terminal | null
  ws: TerminalWebSocket | null
  fitAddon: FitAddon | null
  connected: boolean
  historyLoading: boolean
  historyProgress: number
}

// Storage key for session persistence
const getStorageKey = (containerId: string) => `terminal_sessions_${containerId}`

// Load saved sessions from localStorage
const loadSavedSessions = (containerId: string): { key: string; sessionId: string }[] => {
  try {
    const saved = localStorage.getItem(getStorageKey(containerId))
    return saved ? JSON.parse(saved) : []
  } catch {
    return []
  }
}

// Save sessions to localStorage
const saveSessions = (containerId: string, tabs: TerminalTab[]) => {
  const sessions = tabs
    .filter(t => t.sessionId)
    .map(t => ({ key: t.key, sessionId: t.sessionId! }))
  localStorage.setItem(getStorageKey(containerId), JSON.stringify(sessions))
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
  const [fileDrawerOpen, setFileDrawerOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true)
  const initializedRef = useRef(false)

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
      } catch {
        setError('Failed to fetch container information')
      } finally {
        setLoading(false)
      }
    }
    fetchContainer()
  }, [containerId])

  // Restore saved sessions or create initial tab
  useEffect(() => {
    if (!container || container.status !== 'running' || container.init_status !== 'ready') return
    if (initializedRef.current) return
    if (!containerId) return
    
    initializedRef.current = true
    
    const savedSessions = loadSavedSessions(containerId)
    
    if (savedSessions.length > 0) {
      // Restore saved sessions
      const restoredTabs: TerminalTab[] = savedSessions.map((s, index) => {
        tabCounter = Math.max(tabCounter, index + 1)
        return {
          key: s.key,
          label: `Terminal ${index + 1}`,
          sessionId: s.sessionId,
          terminal: null,
          ws: null,
          fitAddon: null,
          connected: false,
          historyLoading: false,
          historyProgress: 0,
        }
      })
      setTabs(restoredTabs)
      setActiveKey(restoredTabs[0].key)
    } else {
      // Create new tab
      addNewTab()
    }
  }, [container, containerId])

  const addNewTab = useCallback((sessionId?: string) => {
    tabCounter++
    const newKey = `terminal-${tabCounter}`
    const newTab: TerminalTab = {
      key: newKey,
      label: `Terminal ${tabCounter}`,
      sessionId: sessionId || null,
      terminal: null,
      ws: null,
      fitAddon: null,
      connected: false,
      historyLoading: false,
      historyProgress: 0,
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

    // Save updated sessions
    if (containerId) {
      saveSessions(containerId, newTabs)
    }

    if (activeKey === targetKey && newTabs.length > 0) {
      setActiveKey(newTabs[newTabs.length - 1].key)
    }
  }, [tabs, activeKey, containerId])


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
        scrollback: 50000, // Large scrollback for history
      })

      const fitAddon = new FitAddon()
      const webLinksAddon = new WebLinksAddon()

      term.loadAddon(fitAddon)
      term.loadAddon(webLinksAddon)
      term.open(element)
      fitAddon.fit()

      const currentTabKey = activeKey

      // Create WebSocket connection with session ID for reconnection
      const ws = new TerminalWebSocket(
        containerId,
        {
          onMessage: (msg) => {
            if (msg.type === 'output' && msg.data) {
              term.write(msg.data)
            } else if (msg.type === 'error' && msg.error) {
              message.error(msg.error)
            }
          },
          onConnect: () => {
            setTabs(prev => prev.map(t => 
              t.key === currentTabKey ? { ...t, connected: true } : t
            ))
            // Only show connected message for new sessions
            if (!tab.sessionId) {
              term.write('\r\n\x1b[32mConnected to container terminal\x1b[0m\r\n\r\n')
            }
            ws.resize(term.cols, term.rows)
          },
          onDisconnect: () => {
            setTabs(prev => prev.map(t => 
              t.key === currentTabKey ? { ...t, connected: false } : t
            ))
            term.write('\r\n\x1b[33mDisconnected - attempting to reconnect...\x1b[0m\r\n')
          },
          onError: (err) => {
            message.error(err)
          },
          onSessionId: (sessionId) => {
            // Save session ID for reconnection
            setTabs(prev => {
              const updated = prev.map(t => 
                t.key === currentTabKey ? { ...t, sessionId } : t
              )
              // Save to localStorage
              if (containerId) {
                saveSessions(containerId, updated)
              }
              return updated
            })
          },
          onHistoryStart: () => {
            term.write('\x1b[2J\x1b[H') // Clear screen
            term.write('\x1b[33m--- Restoring session history ---\x1b[0m\r\n')
            setTabs(prev => prev.map(t => 
              t.key === currentTabKey ? { ...t, historyLoading: true, historyProgress: 0 } : t
            ))
          },
          onHistoryProgress: (progress: HistoryLoadProgress) => {
            setTabs(prev => prev.map(t => 
              t.key === currentTabKey ? { ...t, historyProgress: progress.percent } : t
            ))
          },
          onHistoryEnd: () => {
            term.write('\r\n\x1b[32m--- Session restored ---\x1b[0m\r\n')
            setTabs(prev => prev.map(t => 
              t.key === currentTabKey ? { ...t, historyLoading: false, historyProgress: 100 } : t
            ))
          },
        },
        tab.sessionId || undefined
      )

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
        t.key === currentTabKey ? { ...t, terminal: term, ws, fitAddon } : t
      ))
    }

    initTerminal()
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

  // Cleanup on unmount - don't disconnect, just dispose terminal UI
  useEffect(() => {
    return () => {
      tabs.forEach(tab => {
        // Disconnect WebSocket but session stays alive on server
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
        {tab.historyLoading && (
          <span style={{ marginLeft: 8, fontSize: 12, color: '#1890ff' }}>
            {tab.historyProgress}%
          </span>
        )}
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
      <div style={{ position: 'relative', height: 'calc(100vh - 200px)' }}>
        {tab.historyLoading && (
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 10,
            background: 'rgba(0,0,0,0.8)',
            padding: '8px 16px',
          }}>
            <div style={{ color: '#fff', marginBottom: 4 }}>
              Restoring session history...
            </div>
            <Progress 
              percent={tab.historyProgress} 
              size="small" 
              status="active"
              strokeColor="#52c41a"
            />
          </div>
        )}
        <div
          ref={(el) => setTerminalRef(tab.key, el)}
          style={{
            height: '100%',
            backgroundColor: '#1e1e1e',
            borderRadius: 4,
          }}
        />
      </div>
    ),
  }))

  return (
    <div style={{ height: 'calc(100vh - 112px)', display: 'flex' }}>
      {/* Sidebar */}
      <div style={{
        width: sidebarCollapsed ? 48 : 0,
        background: '#f5f5f5',
        borderRight: '1px solid #e8e8e8',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        paddingTop: 8,
        transition: 'width 0.2s',
      }}>
        {sidebarCollapsed && (
          <Tooltip title="Files" placement="right">
            <Button
              type="text"
              icon={<FolderOutlined style={{ fontSize: 20 }} />}
              onClick={() => setFileDrawerOpen(true)}
              style={{ marginBottom: 8 }}
            />
          </Tooltip>
        )}
      </div>

      {/* Main content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ 
          padding: '8px 16px', 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          borderBottom: '1px solid #e8e8e8',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/')}>
              Back
            </Button>
            <span>
              <strong>Container:</strong> {container?.name}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Button 
              type="text"
              icon={sidebarCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            />
            <Button 
              icon={<FolderOutlined />}
              onClick={() => setFileDrawerOpen(true)}
            >
              Files
            </Button>
            <Button icon={<PlusOutlined />} onClick={() => addNewTab()}>
              New Terminal
            </Button>
          </div>
        </div>

        <div style={{ flex: 1, padding: 8, overflow: 'hidden' }}>
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
                onClick={() => addNewTab()}
                size="small"
              />
            }
          />
        </div>
      </div>

      {/* File Browser Drawer */}
      <Drawer
        title="File Browser"
        placement="left"
        width={400}
        onClose={() => setFileDrawerOpen(false)}
        open={fileDrawerOpen}
        mask={false}
        style={{ position: 'absolute' }}
      >
        <FileBrowser containerId={parseInt(containerId || '0')} />
      </Drawer>
    </div>
  )
}
