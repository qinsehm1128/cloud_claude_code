import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Plus,
  X,
  FolderOpen,
  Loader2,
  AlertCircle,
} from 'lucide-react'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import { WebLinksAddon } from 'xterm-addon-web-links'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Progress } from '@/components/ui/progress'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { TerminalWebSocket, HistoryLoadProgress } from '@/services/websocket'
import { containerApi } from '@/services/api'
import FileBrowser from '@/components/FileManager/FileBrowser'
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

const getStorageKey = (containerId: string) => `terminal_sessions_${containerId}`

const loadSavedSessions = (containerId: string): { key: string; sessionId: string }[] => {
  try {
    const saved = localStorage.getItem(getStorageKey(containerId))
    return saved ? JSON.parse(saved) : []
  } catch {
    return []
  }
}

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
  const initializedRef = useRef(false)

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

  useEffect(() => {
    if (!container || container.status !== 'running' || container.init_status !== 'ready') return
    if (initializedRef.current) return
    if (!containerId) return
    
    initializedRef.current = true
    
    const savedSessions = loadSavedSessions(containerId)
    
    if (savedSessions.length > 0) {
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

    if (containerId) {
      saveSessions(containerId, newTabs)
    }

    if (activeKey === targetKey && newTabs.length > 0) {
      setActiveKey(newTabs[newTabs.length - 1].key)
    }
  }, [tabs, activeKey, containerId])

  useEffect(() => {
    if (!activeKey || !container || !containerId) return

    const tab = tabs.find(t => t.key === activeKey)
    if (!tab || tab.terminal) return

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
          background: '#0a0a0a',
          foreground: '#fafafa',
          cursor: '#fafafa',
          cursorAccent: '#0a0a0a',
          selectionBackground: '#3f3f46',
        },
        scrollback: 50000,
      })

      const fitAddon = new FitAddon()
      const webLinksAddon = new WebLinksAddon()

      term.loadAddon(fitAddon)
      term.loadAddon(webLinksAddon)
      term.open(element)
      fitAddon.fit()

      const currentTabKey = activeKey

      const ws = new TerminalWebSocket(
        containerId,
        {
          onMessage: (msg) => {
            if (msg.type === 'output' && msg.data) {
              term.write(msg.data)
            } else if (msg.type === 'error' && msg.error) {
              console.error(msg.error)
            }
          },
          onConnect: () => {
            setTabs(prev => prev.map(t => 
              t.key === currentTabKey ? { ...t, connected: true } : t
            ))
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
            console.error(err)
          },
          onSessionId: (sessionId) => {
            setTabs(prev => {
              const updated = prev.map(t => 
                t.key === currentTabKey ? { ...t, sessionId } : t
              )
              if (containerId) {
                saveSessions(containerId, updated)
              }
              return updated
            })
          },
          onHistoryStart: () => {
            term.write('\x1b[2J\x1b[H')
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

      term.onData((data) => {
        ws.send(data)
      })

      term.onResize(({ cols, rows }) => {
        ws.resize(cols, rows)
      })

      setTabs(prev => prev.map(t => 
        t.key === currentTabKey ? { ...t, terminal: term, ws, fitAddon } : t
      ))
    }

    initTerminal()
  }, [activeKey, container, containerId, tabs])

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
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6 space-y-4">
        <Button variant="outline" onClick={() => navigate('/')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Dashboard
        </Button>
        <div className="flex items-center gap-2 p-4 text-destructive bg-destructive/10 rounded-md">
          <AlertCircle className="h-5 w-5" />
          {error}
        </div>
      </div>
    )
  }

  const activeTab = tabs.find(t => t.key === activeKey)

  return (
    <div className="flex flex-col h-[calc(100vh-1px)]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b bg-card">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <span className="text-sm text-muted-foreground">
            Container: <span className="text-foreground font-medium">{container?.name}</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setFileDrawerOpen(true)}>
            <FolderOpen className="h-4 w-4 mr-2" />
            Files
          </Button>
          <Button variant="outline" size="sm" onClick={() => addNewTab()}>
            <Plus className="h-4 w-4 mr-2" />
            New Terminal
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 px-4 py-2 border-b bg-card/50">
        <Tabs value={activeKey} onValueChange={setActiveKey} className="flex-1">
          <TabsList className="h-8 bg-transparent p-0 gap-1">
            {tabs.map((tab) => (
              <TabsTrigger
                key={tab.key}
                value={tab.key}
                className="h-8 px-3 data-[state=active]:bg-secondary rounded-md gap-2"
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    tab.connected ? 'bg-green-500' : 'bg-red-500'
                  }`}
                />
                {tab.label}
                {tab.historyLoading && (
                  <span className="text-xs text-blue-400">{tab.historyProgress}%</span>
                )}
                {tabs.length > 1 && (
                  <button
                    className="ml-1 hover:bg-muted rounded p-0.5"
                    onClick={(e) => {
                      e.stopPropagation()
                      removeTab(tab.key)
                    }}
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <Button variant="ghost" size="sm" onClick={() => addNewTab()}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* Terminal Content */}
      <div className="flex-1 relative bg-[#0a0a0a]">
        {activeTab?.historyLoading && (
          <div className="absolute top-0 left-0 right-0 z-10 bg-background/90 p-3 border-b">
            <div className="text-sm text-muted-foreground mb-2">
              Restoring session history...
            </div>
            <Progress value={activeTab.historyProgress} className="h-1" />
          </div>
        )}
        {tabs.map((tab) => (
          <div
            key={tab.key}
            ref={(el) => setTerminalRef(tab.key, el)}
            className={`absolute inset-0 ${tab.key === activeKey ? 'block' : 'hidden'}`}
            style={{ padding: '8px' }}
          />
        ))}
      </div>

      {/* File Browser Sheet */}
      <Sheet open={fileDrawerOpen} onOpenChange={setFileDrawerOpen}>
        <SheetContent side="left" className="w-[400px] sm:w-[500px]">
          <SheetHeader>
            <SheetTitle>File Browser</SheetTitle>
          </SheetHeader>
          <div className="mt-4 h-[calc(100vh-100px)] overflow-auto">
            <FileBrowser containerId={parseInt(containerId || '0')} />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
