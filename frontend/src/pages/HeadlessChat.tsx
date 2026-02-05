import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  MessageSquare,
  Plus,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertCircle,
  RefreshCw,
  Menu,
  X,
  Bot,
  Container,
  LogOut,
  Settings,
  Plug,
  Home,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { containerApi, authApi } from '@/services/api';
import { headlessApi, Conversation, TurnInfo } from '@/services/headlessApi';
import { useHeadlessSession } from '@/hooks/useHeadlessSession';
import { ConversationList, PromptInput } from '@/components/Headless';
import { BackendStatusIndicator, WebSocketStatusIndicator } from '@/components/Headless/StatusIndicators';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface ContainerInfo {
  id: number;
  name: string;
  status: string;
  init_status: string;
  work_dir?: string;
}

interface ModelInfo {
  id: string;
  display_name: string;
  type?: string;
  created_at?: string;
}

export default function HeadlessChat() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  
  const selectedContainerId = searchParams.get('container') ? parseInt(searchParams.get('container')!) : null;
  const selectedConversationId = searchParams.get('conversation') ? parseInt(searchParams.get('conversation')!) : null;
  
  const [containers, setContainers] = useState<ContainerInfo[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loadingContainers, setLoadingContainers] = useState(true);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // 历史对话内容（从 HTTP API 加载）
  const [historyTurns, setHistoryTurns] = useState<TurnInfo[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  
  // 模型选择相关状态
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [loadingModels, setLoadingModels] = useState(false);
  
  // 用于防止重复加载
  const initialLoadDone = useRef(false);

  const selectedContainer = useMemo(() => 
    containers.find(c => c.id === selectedContainerId) || null,
    [containers, selectedContainerId]
  );

  const selectedConversation = useMemo(() =>
    conversations.find(c => c.id === selectedConversationId) || null,
    [conversations, selectedConversationId]
  );

  // 使用新的 hook
  const headless = useHeadlessSession({
    autoConnect: false,
    onError: (code, message) => {
      console.error(`Headless error [${code}]: ${message}`);
    },
  });

  // 只在组件首次挂载时加载容器列表
  useEffect(() => {
    if (initialLoadDone.current) return;
    initialLoadDone.current = true;
    
    const fetchContainers = async () => {
      try {
        setLoadingContainers(true);
        const response = await containerApi.list();
        const runningContainers = response.data.filter(
          (c: ContainerInfo) => c.status === 'running' && c.init_status === 'ready'
        );
        setContainers(runningContainers);
        if (!selectedContainerId && runningContainers.length > 0) {
          setSearchParams({ container: runningContainers[0].id.toString() });
        }
      } catch (err) {
        console.error('Failed to fetch containers:', err);
        setError('Failed to load containers');
      } finally {
        setLoadingContainers(false);
      }
    };
    fetchContainers();
  }, []);

  // 加载对话列表
  const fetchConversations = useCallback(async () => {
    if (!selectedContainerId) return;
    try {
      setLoadingConversations(true);
      const response = await headlessApi.listConversations(selectedContainerId);
      setConversations(response.data || []);
    } catch (err) {
      console.error('Failed to fetch conversations:', err);
      setConversations([]);
    } finally {
      setLoadingConversations(false);
    }
  }, [selectedContainerId]);

  // 当选中的容器变化时加载对话列表
  useEffect(() => {
    if (!selectedContainerId) {
      setConversations([]);
      return;
    }
    fetchConversations();
  }, [selectedContainerId, fetchConversations]);

  // 当选中的容器变化时加载模型列表
  useEffect(() => {
    if (!selectedContainerId) {
      setModels([]);
      setSelectedModel('default'); // 默认使用 "default" 选项
      return;
    }
    
    const loadModels = async () => {
      setLoadingModels(true);
      // 切换容器时重置为默认模型
      setSelectedModel('default');
      
      try {
        // Use backend proxy to avoid CORS issues
        const response = await containerApi.getModels(selectedContainerId);
        const modelList = (response.data.data || []).map(m => ({
          ...m,
          display_name: m.id, // Use id as display_name since API doesn't provide it
        }));
        setModels(modelList);
        // 保持 "default" 选项，不自动选择第一个模型
      } catch (err) {
        console.error('Failed to load models:', err);
        setModels([]);
      } finally {
        setLoadingModels(false);
      }
    };
    
    loadModels();
  }, [selectedContainerId]); // 移除 selectedModel 依赖，避免循环

  // 当选中的对话变化时加载历史内容
  useEffect(() => {
    if (!selectedContainerId || !selectedConversationId) {
      setHistoryTurns([]);
      setHistoryHasMore(false);
      return;
    }
    
    // 如果当前 WebSocket 连接的就是这个对话，不需要从 HTTP 加载
    if (headless.connectedConversationId === selectedConversationId) {
      setHistoryTurns([]);
      return;
    }
    
    // 从 HTTP API 加载历史
    const loadHistory = async () => {
      try {
        setLoadingHistory(true);
        const response = await headlessApi.getConversationTurns(selectedContainerId, selectedConversationId, 20);
        setHistoryTurns(response.data.turns || []);
        setHistoryHasMore(response.data.has_more || false);
      } catch (err) {
        console.error('Failed to load conversation history:', err);
        setHistoryTurns([]);
      } finally {
        setLoadingHistory(false);
      }
    };
    loadHistory();
  }, [selectedContainerId, selectedConversationId, headless.connectedConversationId]);

  // 加载更多历史
  const handleLoadMoreHistory = useCallback(async () => {
    if (!selectedContainerId || !selectedConversationId || loadingHistory || !historyHasMore) return;
    
    if (headless.connectedConversationId === selectedConversationId) {
      headless.loadMoreHistory();
      return;
    }
    
    const oldestTurn = historyTurns[0];
    if (!oldestTurn) return;
    
    try {
      setLoadingHistory(true);
      const response = await headlessApi.getConversationTurns(
        selectedContainerId, 
        selectedConversationId, 
        10,
        oldestTurn.id
      );
      setHistoryTurns(prev => [...(response.data.turns || []), ...prev]);
      setHistoryHasMore(response.data.has_more || false);
    } catch (err) {
      console.error('Failed to load more history:', err);
    } finally {
      setLoadingHistory(false);
    }
  }, [selectedContainerId, selectedConversationId, loadingHistory, historyHasMore, historyTurns, headless]);

  // 刷新对话列表
  const handleRefreshConversations = useCallback(() => {
    fetchConversations();
  }, [fetchConversations]);

  const handleSelectContainer = useCallback((containerId: number) => {
    headless.disconnect();
    setSearchParams({ container: containerId.toString() });
    setSidebarOpen(false);
  }, [setSearchParams, headless]);

  const handleSelectConversation = useCallback(async (conversationId: number) => {
    if (!selectedContainerId) return;
    
    // 如果当前连接的不是这个对话，断开连接
    if (headless.connectedConversationId !== conversationId) {
      headless.disconnect();
    }
    
    setSearchParams({ 
      container: selectedContainerId.toString(),
      conversation: conversationId.toString()
    });
    setSidebarOpen(false);
  }, [selectedContainerId, setSearchParams, headless]);

  // 连接到正在运行的对话
  const handleConnectToConversation = useCallback(async (conv: Conversation, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!selectedContainerId) return;
    
    // 先选中这个对话
    setSearchParams({ 
      container: selectedContainerId.toString(),
      conversation: conv.id.toString()
    });
    
    // 连接到这个对话
    await headless.connectToConversation(conv.id);
  }, [selectedContainerId, setSearchParams, headless]);

  // 创建新对话
  const handleNewConversation = useCallback(async () => {
    if (!selectedContainerId || !selectedContainer) return;
    
    // 断开现有连接
    headless.disconnect();
    
    // 连接到容器（创建新会话模式）
    await headless.connectToContainer(selectedContainerId);
    
    // 创建新会话
    headless.startSession(selectedContainer.work_dir);
    setSearchParams({ container: selectedContainerId.toString() });
    setSidebarOpen(false);
    
    // 刷新对话列表
    setTimeout(() => fetchConversations(), 1000);
  }, [selectedContainerId, selectedContainer, headless, setSearchParams, fetchConversations]);

  const handleDeleteConversation = useCallback(async (conversationId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!selectedContainerId) return;
    if (!confirm('Are you sure you want to delete this conversation?')) return;
    
    // 如果正在连接这个对话，先断开
    if (headless.connectedConversationId === conversationId) {
      headless.disconnect();
    }
    
    try {
      await headlessApi.deleteConversation(selectedContainerId, conversationId);
      setConversations(prev => prev.filter(c => c.id !== conversationId));
      if (selectedConversationId === conversationId) {
        setSearchParams({ container: selectedContainerId.toString() });
      }
    } catch (err) {
      console.error('Failed to delete conversation:', err);
    }
  }, [selectedContainerId, selectedConversationId, setSearchParams, headless]);

  const handleSendPrompt = useCallback((prompt: string) => {
    if (!headless.hasSession) {
      headless.startSession(selectedContainer?.work_dir);
    }
    // 当选择 "default" 时不传递 model 参数，让 Claude 使用默认模型
    const modelToSend = selectedModel === 'default' ? undefined : selectedModel || undefined;
    headless.sendPrompt(prompt, 'user', modelToSend);
  }, [headless, selectedContainer?.work_dir, selectedModel]);

  const handleLogout = async () => {
    try { await authApi.logout(); } catch { /* ignore */ }
    localStorage.removeItem('token');
    navigate('/login');
  };

  // 获取要显示的 turns
  const displayTurns = useMemo(() => {
    if (headless.connectedConversationId === selectedConversationId) {
      return headless.turns;
    }
    return historyTurns;
  }, [headless.connectedConversationId, headless.turns, selectedConversationId, historyTurns]);

  const displayHasMore = useMemo(() => {
    if (headless.connectedConversationId === selectedConversationId) {
      return headless.hasMoreHistory;
    }
    return historyHasMore;
  }, [headless.connectedConversationId, headless.hasMoreHistory, selectedConversationId, historyHasMore]);

  const displayLoading = useMemo(() => {
    if (headless.connectedConversationId === selectedConversationId) {
      return headless.loadingHistory;
    }
    return loadingHistory;
  }, [headless.connectedConversationId, headless.loadingHistory, selectedConversationId, loadingHistory]);

  const renderSidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className={cn(
        "flex items-center h-14 border-b px-4 flex-shrink-0",
        sidebarCollapsed ? "justify-center" : "gap-2"
      )}>
        <Bot className="h-6 w-6 text-primary flex-shrink-0" />
        {!sidebarCollapsed && <span className="font-semibold text-lg">Headless</span>}
      </div>

      {/* Containers */}
      <div className="flex-shrink-0 border-b">
        <div className={cn(
          "px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider",
          sidebarCollapsed && "text-center"
        )}>
          {sidebarCollapsed ? <Container className="h-4 w-4 mx-auto" /> : 'Containers'}
        </div>
        <div className="px-2 pb-2 space-y-1 max-h-40 overflow-y-auto">
          {loadingContainers ? (
            <div className="flex justify-center py-2">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : containers.length === 0 ? (
            <div className={cn("text-sm text-muted-foreground py-2", sidebarCollapsed ? "text-center" : "px-2")}>
              {sidebarCollapsed ? '-' : 'No running containers'}
            </div>
          ) : (
            containers.map(container => (
              <button
                key={container.id}
                onClick={() => handleSelectContainer(container.id)}
                className={cn(
                  "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors",
                  selectedContainerId === container.id
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted text-foreground",
                  sidebarCollapsed && "justify-center"
                )}
                title={container.name}
              >
                <Container className="h-4 w-4 flex-shrink-0" />
                {!sidebarCollapsed && <span className="truncate">{container.name}</span>}
              </button>
            ))
          )}
        </div>
      </div>

      {/* Conversations */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className={cn(
          "flex items-center justify-between px-3 py-2 flex-shrink-0",
          sidebarCollapsed && "justify-center"
        )}>
          {!sidebarCollapsed && (
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Conversations
            </span>
          )}
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className={cn("h-7", sidebarCollapsed ? "w-7 p-0" : "px-2")}
              onClick={handleRefreshConversations}
              disabled={!selectedContainerId || loadingConversations}
              title="Refresh conversations"
            >
              <RefreshCw className={cn("h-4 w-4", loadingConversations && "animate-spin")} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={cn("h-7", sidebarCollapsed ? "w-7 p-0" : "px-2")}
              onClick={handleNewConversation}
              disabled={!selectedContainerId}
              title="New conversation (will connect and kill PTY)"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-1">
          {loadingConversations ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : !selectedContainerId ? (
            <div className={cn("text-sm text-muted-foreground py-4", sidebarCollapsed ? "text-center" : "px-2")}>
              {sidebarCollapsed ? '-' : 'Select a container'}
            </div>
          ) : conversations.length === 0 ? (
            <div className={cn("text-sm text-muted-foreground py-4", sidebarCollapsed ? "text-center" : "px-2")}>
              {sidebarCollapsed ? '-' : 'No conversations yet'}
            </div>
          ) : (
            conversations.map(conv => {
              const isWsConnected = headless.connectedConversationId === conv.id && headless.connected;
              
              return (
                <button
                  key={conv.id}
                  onClick={() => handleSelectConversation(conv.id)}
                  className={cn(
                    "w-full group flex items-center gap-2 px-2 py-2 rounded-md text-sm transition-colors text-left relative",
                    selectedConversationId === conv.id
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted text-foreground",
                    sidebarCollapsed && "justify-center"
                  )}
                  title={conv.title || `Conversation ${conv.id}`}
                >
                  <MessageSquare className="h-4 w-4 flex-shrink-0" />
                  {!sidebarCollapsed && (
                    <>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1">
                          <span className="truncate font-medium">{conv.title || `Conversation ${conv.id}`}</span>
                        </div>
                        <div className="text-xs opacity-70 truncate flex items-center gap-2">
                          <span>{conv.total_turns} turns</span>
                          <span>·</span>
                          <span>{new Date(conv.updated_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                      {/* 状态指示器 */}
                      <div className="flex items-center gap-1">
                        <BackendStatusIndicator isRunning={conv.is_running} />
                        <WebSocketStatusIndicator isConnected={isWsConnected} />
                      </div>
                      {/* 连接按钮 - 只在后端运行但未连接时显示 */}
                      {conv.is_running && !isWsConnected && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className={cn(
                            "h-6 px-2 text-xs gap-1",
                            selectedConversationId === conv.id 
                              ? "bg-primary-foreground/20 text-primary-foreground" 
                              : "bg-green-500/20 text-green-600 hover:bg-green-500/30"
                          )}
                          onClick={(e) => handleConnectToConversation(conv, e)}
                          title="Connect to this running conversation"
                        >
                          <Plug className="h-3 w-3" />
                        </Button>
                      )}
                      {/* 删除按钮 - 只在非运行状态显示 */}
                      {!conv.is_running && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className={cn(
                            "h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity",
                            selectedConversationId === conv.id && "hover:bg-primary-foreground/20"
                          )}
                          onClick={(e) => handleDeleteConversation(conv.id, e)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="flex-shrink-0 border-t p-2 space-y-1">
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "w-full text-muted-foreground hover:text-foreground",
            sidebarCollapsed ? "justify-center p-2" : "justify-start gap-2"
          )}
          onClick={() => navigate('/')}
        >
          <Home className="h-4 w-4" />
          {!sidebarCollapsed && 'Back to Home'}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "w-full text-muted-foreground hover:text-foreground",
            sidebarCollapsed ? "justify-center p-2" : "justify-start gap-2"
          )}
          onClick={() => navigate('/settings')}
        >
          <Settings className="h-4 w-4" />
          {!sidebarCollapsed && 'Settings'}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "w-full text-muted-foreground hover:text-foreground",
            sidebarCollapsed ? "justify-center p-2" : "justify-start gap-2"
          )}
          onClick={handleLogout}
        >
          <LogOut className="h-4 w-4" />
          {!sidebarCollapsed && 'Logout'}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "w-full text-muted-foreground hover:text-foreground hidden md:flex",
            sidebarCollapsed ? "justify-center p-2" : "justify-start gap-2"
          )}
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
        >
          {sidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : (
            <><ChevronLeft className="h-4 w-4" />Collapse</>
          )}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-background">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "bg-card border-r flex flex-col transition-all duration-300 z-50",
        "fixed md:relative inset-y-0 left-0",
        sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
        sidebarCollapsed ? "w-16" : "w-72"
      )}>
        <Button
          variant="ghost"
          size="sm"
          className="absolute top-2 right-2 h-8 w-8 p-0 md:hidden"
          onClick={() => setSidebarOpen(false)}
        >
          <X className="h-4 w-4" />
        </Button>
        {renderSidebarContent()}
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="flex items-center gap-4 h-14 px-4 border-b bg-card flex-shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 md:hidden"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>

          <div className="flex-1 min-w-0">
            {selectedContainer ? (
              <div className="flex items-center gap-2">
                <span className="font-medium truncate">{selectedContainer.name}</span>
                {selectedConversation && (
                  <>
                    <span className="text-muted-foreground">/</span>
                    <span className="text-muted-foreground truncate">
                      {selectedConversation.title || `Conversation ${selectedConversation.id}`}
                    </span>
                  </>
                )}
              </div>
            ) : (
              <span className="text-muted-foreground">Select a container to start</span>
            )}
          </div>

          <div className="flex items-center gap-2 text-sm">
            {/* Model Selector */}
            {(models.length > 0 || selectedModel === 'default') && (
              <Select
                value={selectedModel || 'default'}
                onValueChange={(value) => setSelectedModel(value)}
                disabled={loadingModels}
              >
                <SelectTrigger className="h-7 w-[180px] text-xs">
                  {loadingModels ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <>
                      <Bot className="h-3 w-3 mr-1 flex-shrink-0" />
                      <SelectValue placeholder="Select Model" />
                    </>
                  )}
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Default</SelectItem>
                  {models.map((model) => (
                    <SelectItem key={model.id} value={model.id}>
                      {model.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <span className={cn(
              "w-2 h-2 rounded-full",
              headless.connected ? "bg-green-500" : "bg-red-500"
            )} />
            <span className="text-muted-foreground hidden sm:inline">
              {headless.connecting ? 'Connecting...' : headless.connected ? 'Connected' : 'Disconnected'}
            </span>
            {/* 连接按钮 - 只在选中了对话但未连接时显示 */}
            {!headless.connected && !headless.connecting && selectedConversationId && selectedConversation && (
              <Button 
                variant="outline" 
                size="sm" 
                className="h-7 gap-1" 
                onClick={() => handleConnectToConversation(selectedConversation)}
                title={selectedConversation.is_running ? "Connect to running conversation" : "Start new session for this conversation"}
              >
                <Plug className="h-4 w-4" />
                <span className="hidden sm:inline">Connect</span>
              </Button>
            )}
          </div>
        </header>

        {/* Error display */}
        {(error || headless.error) && (
          <div className="px-4 py-2 bg-destructive/10 border-b flex-shrink-0">
            <div className="flex items-center gap-2 text-destructive text-sm">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span className="flex-1">{error || headless.error}</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6"
                onClick={() => { setError(null); headless.clearError(); }}
              >
                Dismiss
              </Button>
            </div>
          </div>
        )}

        {/* Conversation content */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {!selectedContainerId ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <Container className="h-12 w-12 mb-4 opacity-50" />
              <p>Select a container from the sidebar</p>
            </div>
          ) : loadingHistory ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin mb-4" />
              <p>Loading conversation...</p>
            </div>
          ) : selectedConversationId && displayTurns.length > 0 ? (
            <ConversationList
              turns={displayTurns}
              currentTurnEvents={headless.connectedConversationId === selectedConversationId ? headless.currentTurnEvents : []}
              currentTurnId={headless.connectedConversationId === selectedConversationId ? headless.currentTurnId : null}
              hasMore={displayHasMore}
              loading={displayLoading}
              onLoadMore={handleLoadMoreHistory}
            />
          ) : !selectedConversationId && !headless.connected ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <MessageSquare className="h-12 w-12 mb-4 opacity-50" />
              <p>Select a conversation or create a new one</p>
              <Button 
                variant="default" 
                size="sm" 
                className="mt-4 gap-2" 
                onClick={handleNewConversation}
              >
                <Plus className="h-4 w-4" />
                New Conversation
              </Button>
            </div>
          ) : selectedConversationId && !headless.connected ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <Plug className="h-12 w-12 mb-4 opacity-50" />
              <p>Not connected to this conversation</p>
              <p className="text-sm mt-1">
                {selectedConversation?.is_running 
                  ? 'This conversation is running. Click Connect to join.'
                  : 'Click Connect to start a new session.'}
              </p>
              {selectedConversation?.is_running && (
                <p className="text-xs mt-2 text-yellow-500">The backend session is still running</p>
              )}
              <Button 
                variant="default" 
                size="sm" 
                className="mt-4 gap-2" 
                onClick={() => selectedConversation && handleConnectToConversation(selectedConversation)}
              >
                <Plug className="h-4 w-4" />
                Connect
              </Button>
            </div>
          ) : headless.turns.length === 0 && headless.currentTurnEvents.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <MessageSquare className="h-12 w-12 mb-4 opacity-50" />
              <p>Start a new conversation</p>
              <p className="text-sm mt-1">Type a message below to begin</p>
            </div>
          ) : (
            <ConversationList
              turns={headless.turns}
              currentTurnEvents={headless.currentTurnEvents}
              currentTurnId={headless.currentTurnId}
              hasMore={headless.hasMoreHistory}
              loading={headless.loadingHistory}
              onLoadMore={() => headless.loadMoreHistory()}
            />
          )}
        </div>

        {/* Prompt input */}
        {selectedContainerId && headless.connected && (
          headless.connectedConversationId === selectedConversationId || !selectedConversationId
        ) && (
          <PromptInput
            onSend={handleSendPrompt}
            onCancel={() => headless.cancelExecution()}
            isRunning={headless.isRunning}
            disabled={!headless.connected}
            placeholder={headless.hasSession ? 'Enter your message...' : 'Type a message to start...'}
          />
        )}
      </main>
    </div>
  );
}
