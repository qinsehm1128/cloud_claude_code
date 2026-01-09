import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Loader2,
  AlertCircle,
  RefreshCw,
  Settings,
  PanelRightClose,
  PanelRight,
  ListTodo,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { containerApi } from '@/services/api';
import { monitoringApi } from '@/services/monitoringApi';
import { taskApi, Task as ApiTask } from '@/services/taskApi';
import { useHeadlessSession } from '@/hooks/useHeadlessSession';
import { ConversationList, PromptInput, LiveOutput } from '@/components/Headless';
import { MonitoringStatusBar, MonitoringStatus } from '@/components/Automation/MonitoringStatusBar';
import { MonitoringConfigPanel, MonitoringConfig } from '@/components/Automation/MonitoringConfigPanel';
import { TaskPanel, Task } from '@/components/Automation/TaskPanel';
import { TaskEditor } from '@/components/Automation/TaskEditor';

interface Container {
  id: number;
  name: string;
  status: string;
  init_status: string;
  work_dir?: string;
}

export default function HeadlessTerminal() {
  const { containerId } = useParams<{ containerId: string }>();
  const navigate = useNavigate();
  
  const [container, setContainer] = useState<Container | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [taskPanelOpen, setTaskPanelOpen] = useState(false);
  const [monitoringStatus, setMonitoringStatus] = useState<MonitoringStatus>({
    enabled: false,
    silenceDuration: 0,
    threshold: 30,
    strategy: 'webhook',
    queueSize: 0,
    claudeDetected: false,
  });
  const [monitoringConfig, setMonitoringConfig] = useState<MonitoringConfig>({
    silenceThreshold: 30,
    activeStrategy: 'webhook',
  });
  const [tasks, setTasks] = useState<Task[]>([]);
  const hasSwitchedRef = useRef(false);
  const [containerReady, setContainerReady] = useState(false);


  // Headless session hook - 使用稳定的 containerReady 状态而不是 container 对象
  const headless = useHeadlessSession({
    containerId: parseInt(containerId || '0'),
    autoConnect: containerReady,
    onModeSwitch: (mode, closedSessions) => {
      console.log(`Mode switched to ${mode}, closed ${closedSessions} sessions`);
      if (mode === 'tui') {
        navigate(`/terminal/${containerId}`);
      }
    },
    onError: (code, message) => {
      console.error(`Headless error [${code}]: ${message}`);
    },
  });

  // Load container info
  useEffect(() => {
    const fetchContainer = async () => {
      if (!containerId) return;
      try {
        const response = await containerApi.get(parseInt(containerId));
        setContainer(response.data);
        if (response.data.status !== 'running') {
          setError('Container is not running');
          setContainerReady(false);
        } else if (response.data.init_status !== 'ready') {
          setError('Container initialization not complete');
          setContainerReady(false);
        } else {
          // 容器就绪，可以连接
          setContainerReady(true);
        }
      } catch {
        setError('Failed to fetch container information');
        setContainerReady(false);
      } finally {
        setLoading(false);
      }
    };
    fetchContainer();
  }, [containerId]);

  // Load monitoring config and tasks
  useEffect(() => {
    if (!containerId) return;
    
    const loadMonitoringData = async () => {
      try {
        const configResponse = await monitoringApi.getConfig(parseInt(containerId));
        const config = configResponse.data;
        setMonitoringConfig({
          silenceThreshold: config.silence_threshold,
          activeStrategy: config.active_strategy,
          webhookUrl: config.webhook_url,
          injectionCommand: config.injection_command,
          userPromptTemplate: config.user_prompt_template,
        });
        setMonitoringStatus(prev => ({
          ...prev,
          enabled: config.enabled,
          threshold: config.silence_threshold,
          strategy: config.active_strategy,
        }));
      } catch (err) {
        console.error('Failed to load monitoring config:', err);
      }

      try {
        const tasksResponse = await taskApi.list(parseInt(containerId));
        const loadedTasks: Task[] = tasksResponse.data.map((t: ApiTask) => ({
          id: t.id,
          text: t.text,
          status: t.status as Task['status'],
          order: t.order_index,
        }));
        setTasks(loadedTasks);
        setMonitoringStatus(prev => ({
          ...prev,
          queueSize: loadedTasks.filter(t => t.status === 'pending').length,
        }));
      } catch (err) {
        console.error('Failed to load tasks:', err);
      }
    };

    loadMonitoringData();
  }, [containerId]);

  // Ensure backend switches to headless mode on connect (close PTY sessions)
  useEffect(() => {
    if (!headless.connected) {
      hasSwitchedRef.current = false;
      return;
    }
    if (!hasSwitchedRef.current) {
      hasSwitchedRef.current = true;
      headless.switchMode('headless');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [headless.connected]);


  // Monitoring handlers
  const handleMonitoringToggle = useCallback(async () => {
    if (!containerId) return;
    try {
      const newEnabled = !monitoringStatus.enabled;
      if (newEnabled) {
        await monitoringApi.enable(parseInt(containerId), {
          silence_threshold: monitoringConfig.silenceThreshold,
          active_strategy: monitoringConfig.activeStrategy,
          webhook_url: monitoringConfig.webhookUrl,
          injection_command: monitoringConfig.injectionCommand,
          user_prompt_template: monitoringConfig.userPromptTemplate,
        });
      } else {
        await monitoringApi.disable(parseInt(containerId));
      }
      setMonitoringStatus(prev => ({ ...prev, enabled: newEnabled, silenceDuration: 0 }));
    } catch (err) {
      console.error('Failed to toggle monitoring:', err);
    }
  }, [containerId, monitoringStatus.enabled, monitoringConfig]);

  const handleConfigSave = useCallback(async (config: MonitoringConfig) => {
    if (!containerId) return;
    try {
      await monitoringApi.updateConfig(parseInt(containerId), {
        silence_threshold: config.silenceThreshold,
        active_strategy: config.activeStrategy,
        webhook_url: config.webhookUrl,
        injection_command: config.injectionCommand,
        user_prompt_template: config.userPromptTemplate,
      });
      setMonitoringConfig(config);
      setMonitoringStatus(prev => ({
        ...prev,
        threshold: config.silenceThreshold,
        strategy: config.activeStrategy,
      }));
    } catch (err) {
      console.error('Failed to save monitoring config:', err);
    }
  }, [containerId]);

  // Task handlers
  const handleAddTask = useCallback(async (text: string) => {
    if (!containerId) return;
    try {
      const response = await taskApi.add(parseInt(containerId), text);
      const newTask: Task = {
        id: response.data.id,
        text: response.data.text,
        status: response.data.status as Task['status'],
        order: response.data.order_index,
      };
      setTasks(prev => [...prev, newTask]);
      setMonitoringStatus(prev => ({ ...prev, queueSize: prev.queueSize + 1 }));
    } catch (err) {
      console.error('Failed to add task:', err);
    }
  }, [containerId]);

  const handleRemoveTask = useCallback(async (id: number) => {
    if (!containerId) return;
    try {
      await taskApi.remove(parseInt(containerId), id);
      setTasks(prev => prev.filter(t => t.id !== id));
      setMonitoringStatus(prev => ({ ...prev, queueSize: Math.max(0, prev.queueSize - 1) }));
    } catch (err) {
      console.error('Failed to remove task:', err);
    }
  }, [containerId]);

  const handleReorderTasks = useCallback(async (taskIds: number[]) => {
    if (!containerId) return;
    try {
      await taskApi.reorder(parseInt(containerId), taskIds);
      setTasks(prev => {
        const taskMap = new Map(prev.map(t => [t.id, t]));
        return taskIds.map((id, index) => ({
          ...taskMap.get(id)!,
          order: index,
        }));
      });
    } catch (err) {
      console.error('Failed to reorder tasks:', err);
    }
  }, [containerId]);

  const handleClearTasks = useCallback(async () => {
    if (!containerId) return;
    try {
      await taskApi.clear(parseInt(containerId));
      setTasks([]);
      setMonitoringStatus(prev => ({ ...prev, queueSize: 0 }));
    } catch (err) {
      console.error('Failed to clear tasks:', err);
    }
  }, [containerId]);

  const handleImportTasks = useCallback(async (texts: string[]) => {
    if (!containerId) return;
    try {
      const newTasks: Task[] = [];
      for (const text of texts) {
        const response = await taskApi.add(parseInt(containerId), text);
        newTasks.push({
          id: response.data.id,
          text: response.data.text,
          status: response.data.status as Task['status'],
          order: response.data.order_index,
        });
      }
      setTasks(prev => [...prev, ...newTasks]);
      setMonitoringStatus(prev => ({ ...prev, queueSize: prev.queueSize + texts.length }));
    } catch (err) {
      console.error('Failed to import tasks:', err);
    }
  }, [containerId]);


  // Handle send prompt
  const handleSendPrompt = useCallback((prompt: string) => {
    if (!headless.hasSession) {
      // Start session first, then send prompt
      // The hook will handle sending the prompt after session is ready via pendingPromptRef
      headless.startSession(container?.work_dir);
    }
    // Always call sendPrompt - the hook will handle the pending logic
    headless.sendPrompt(prompt);
  }, [headless, container?.work_dir]);

  // Switch to TUI mode
  const handleSwitchToTUI = useCallback(() => {
    headless.switchMode('tui');
  }, [headless]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
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
    );
  }

  return (
    <div className="flex h-[calc(100vh-1px)]">
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b bg-card flex-shrink-0">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <span className="text-sm text-muted-foreground">
              Container: <span className="text-foreground font-medium">{container?.name}</span>
            </span>
            <span className="text-xs px-2 py-0.5 bg-blue-500/10 text-blue-500 rounded">
              Headless Mode
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSwitchToTUI}
            >
              Switch to TUI
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setTaskPanelOpen(!taskPanelOpen)}
            >
              {taskPanelOpen ? (
                <PanelRightClose className="h-4 w-4 mr-2" />
              ) : (
                <PanelRight className="h-4 w-4 mr-2" />
              )}
              <ListTodo className="h-4 w-4 mr-1" />
              Tasks
              {tasks.filter(t => t.status === 'pending').length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 text-xs bg-primary text-primary-foreground rounded-full">
                  {tasks.filter(t => t.status === 'pending').length}
                </span>
              )}
            </Button>
          </div>
        </div>


        {/* Session Status Bar */}
        <div className="flex items-center gap-4 px-4 py-2 border-b bg-muted/30 text-sm">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${headless.connected ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-muted-foreground">
              {headless.connecting ? 'Connecting...' : headless.connected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
          {headless.sessionId && (
            <span className="text-muted-foreground">
              Session: <span className="font-mono text-xs">{headless.sessionId.slice(0, 8)}...</span>
            </span>
          )}
          {headless.state !== 'idle' && (
            <span className={`px-2 py-0.5 rounded text-xs ${
              headless.state === 'running' ? 'bg-blue-500/10 text-blue-500' :
              headless.state === 'error' ? 'bg-red-500/10 text-red-500' :
              'bg-muted text-muted-foreground'
            }`}>
              {headless.state}
            </span>
          )}
          {!headless.connected && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => headless.connectToContainer(parseInt(containerId || '0'))}
              disabled={headless.connecting}
            >
              <RefreshCw className={`h-4 w-4 mr-1 ${headless.connecting ? 'animate-spin' : ''}`} />
              Reconnect
            </Button>
          )}
        </div>

        {/* Error Display */}
        {headless.error && (
          <div className="px-4 py-2 bg-destructive/10 border-b">
            <div className="flex items-center gap-2 text-destructive text-sm">
              <AlertCircle className="h-4 w-4" />
              <span>{headless.error}</span>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto h-6"
                onClick={() => headless.clearError()}
              >
                Dismiss
              </Button>
            </div>
          </div>
        )}

        {/* Conversation Area */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <ConversationList
            turns={headless.turns}
            currentTurnEvents={headless.currentTurnEvents}
            currentTurnId={headless.currentTurnId}
            hasMore={headless.hasMoreHistory}
            loading={headless.loadingHistory}
            onLoadMore={() => headless.loadMoreHistory()}
          />
        </div>

        {/* Live Output (when running) */}
        {headless.isRunning && headless.currentTurnEvents.length > 0 && (
          <div className="px-4 py-2 border-t">
            <LiveOutput events={headless.currentTurnEvents} />
          </div>
        )}

        {/* Prompt Input */}
        <PromptInput
          onSend={handleSendPrompt}
          onCancel={() => headless.cancelExecution()}
          isRunning={headless.isRunning}
          disabled={!headless.connected}
          placeholder={headless.hasSession ? 'Enter your prompt...' : 'Enter prompt to start a new session...'}
        />

        {/* Monitoring Status Bar */}
        <MonitoringStatusBar
          status={monitoringStatus}
          onToggle={handleMonitoringToggle}
          onOpenSettings={() => setTaskPanelOpen(true)}
        />
      </div>


      {/* Task Panel - Right sidebar */}
      <div
        className={`h-full bg-card border-l flex flex-col transition-all duration-300 ${
          taskPanelOpen ? 'w-96' : 'w-0'
        } overflow-hidden`}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0">
          <h3 className="font-medium text-sm">Automation</h3>
          <div className="flex items-center gap-1">
            <TaskEditor
              tasks={tasks}
              onImport={handleImportTasks}
              onClear={handleClearTasks}
            />
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => setTaskPanelOpen(false)}
            >
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {taskPanelOpen && (
          <Tabs defaultValue="tasks" className="flex-1 flex flex-col overflow-hidden">
            <TabsList className="mx-4 mt-2 grid grid-cols-2">
              <TabsTrigger value="tasks">
                <ListTodo className="h-4 w-4 mr-1" />
                Tasks
              </TabsTrigger>
              <TabsTrigger value="settings">
                <Settings className="h-4 w-4 mr-1" />
                Settings
              </TabsTrigger>
            </TabsList>

            <TabsContent value="tasks" className="flex-1 overflow-hidden mt-0 p-0">
              <TaskPanel
                tasks={tasks}
                onAddTask={handleAddTask}
                onRemoveTask={handleRemoveTask}
                onReorderTasks={handleReorderTasks}
                onClearTasks={handleClearTasks}
              />
            </TabsContent>

            <TabsContent value="settings" className="flex-1 overflow-auto mt-0">
              <MonitoringConfigPanel
                config={monitoringConfig}
                onSave={handleConfigSave}
              />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
}
