import { useState, useEffect, useCallback, useRef } from 'react';
import {
  HeadlessWebSocketService,
  isSessionInfo,
  isHistoryPayload,
  isStreamEvent,
  isTurnCompletePayload,
  isErrorPayload,
  isModeSwitchedPayload,
  isQueueUpdatePayload,
} from '../services/headlessWebsocket';
import {
  extractAssistantMessageContentFromStreamEvents,
  normalizeAssistantResponse,
  normalizeTurnInfo,
  type HeadlessSessionState,
  type HeadlessResponseType,
  type TurnInfo,
  type StreamEvent,
  type SessionInfo,
  type HistoryPayload,
  type TurnCompletePayload,
  type ErrorPayload,
  type ModeSwitchedPayload,
} from '../types/headless';

const initialState: HeadlessSessionState = {
  sessionId: null,
  claudeSessionId: null,
  state: 'idle',
  conversationId: null,
  currentTurnId: null,
  turns: [],
  hasMoreHistory: false,
  loadingHistory: false,
  currentTurnEvents: [],
  queuedTurns: [],
  connected: false,
  connecting: false,
  error: null,
};

export interface UseHeadlessSessionOptions {
  containerId?: number;
  conversationId?: number;
  autoConnect?: boolean;
  onModeSwitch?: (mode: 'tui' | 'headless', closedSessions: number) => void;
  onError?: (code: string, message: string) => void;
  onSessionCreated?: (conversationId: number, sessionId: string) => void;
}

export function useHeadlessSession(options: UseHeadlessSessionOptions) {
  const { containerId, conversationId, autoConnect = false, onModeSwitch, onError, onSessionCreated } = options;
  
  const [state, setState] = useState<HeadlessSessionState>(initialState);
  const [connectedConversationId, setConnectedConversationId] = useState<number | null>(null);
  const wsRef = useRef<HeadlessWebSocketService | null>(null);
  const mountedRef = useRef(true);
  const connectingRef = useRef(false);
  const lastPromptRef = useRef<{ text: string; source: string } | null>(null);
  const pendingPromptRef = useRef<{ text: string; source: string } | null>(null);
  // 当正在创建新会话时，忽略 auto-recovery 的 session_info
  const ignoreAutoRecoveryRef = useRef(false);
  // 断连 grace period timer，防止短暂断连导致 UI 闪烁
  const disconnectGraceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 安全的状态更新
  const safeSetState = useCallback((updater: (prev: HeadlessSessionState) => HeadlessSessionState) => {
    if (mountedRef.current) {
      setState(updater);
    }
  }, []);

  // 处理 session_info 消息
  const handleSessionInfo = useCallback((payload: SessionInfo) => {
    // 如果正在创建新会话，忽略自动恢复的旧 session_info（等待 force_new 后端返回的新 session_info）
    if (ignoreAutoRecoveryRef.current) {
      // 这是 force_new startSession 发送前，handleConnection 自动恢复的旧 session
      // 跳过，不触发 onSessionCreated
      ignoreAutoRecoveryRef.current = false;
      // 仍然更新内部状态但不通知父组件
      safeSetState(prev => ({
        ...prev,
        sessionId: payload.session_id,
        claudeSessionId: payload.claude_session_id || null,
        state: payload.state,
        conversationId: payload.conversation_id,
        currentTurnId: payload.current_turn_id || null,
      }));

      // 如果有 pending prompt，现在发送
      if (pendingPromptRef.current && payload.state === 'idle') {
        const { text, source } = pendingPromptRef.current;
        pendingPromptRef.current = null;
        setTimeout(() => {
          if (wsRef.current?.isConnected()) {
            wsRef.current.sendPrompt(text, source);
          }
        }, 50);
      }
      return;
    }

    safeSetState(prev => {
      // 如果是新会话（之前没有 conversationId 或 conversationId 变了），通知父组件
      if (payload.conversation_id && prev.conversationId !== payload.conversation_id) {
        // 使用 setTimeout 避免在 setState 中触发外部回调
        setTimeout(() => {
          onSessionCreated?.(payload.conversation_id, payload.session_id);
        }, 0);
      }

      return {
        ...prev,
        sessionId: payload.session_id,
        claudeSessionId: payload.claude_session_id || null,
        state: payload.state,
        conversationId: payload.conversation_id,
        currentTurnId: payload.current_turn_id || null,
      };
    });

    // 如果有 pending prompt，现在发送
    if (pendingPromptRef.current && payload.state === 'idle') {
      const { text, source } = pendingPromptRef.current;
      pendingPromptRef.current = null;
      setTimeout(() => {
        if (wsRef.current?.isConnected()) {
          wsRef.current.sendPrompt(text, source);
        }
      }, 50);
    }
  }, [safeSetState, onSessionCreated]);

  // 处理 history 消息
  const handleHistory = useCallback((payload: HistoryPayload, isMore: boolean) => {
    safeSetState(prev => {
      const normalizedTurns = payload.turns.map(normalizeTurnInfo);
      const newTurns = isMore
        ? [...normalizedTurns, ...prev.turns]
        : normalizedTurns;
      
      return {
        ...prev,
        turns: newTurns,
        hasMoreHistory: payload.has_more,
        loadingHistory: false,
      };
    });
  }, [safeSetState]);

  // 处理 event 消息
  const handleEvent = useCallback((payload: StreamEvent) => {
    safeSetState(prev => ({
      ...prev,
      currentTurnEvents: [...prev.currentTurnEvents, payload],
      state: 'running',
    }));
  }, [safeSetState]);

  // 处理 turn_complete 消息
  const handleTurnComplete = useCallback((payload: TurnCompletePayload) => {
    safeSetState(prev => {
      const extractUserPrompt = (events: StreamEvent[], fallback?: string) => {
        for (const event of events) {
          if (event.type === 'user' && event.message?.content?.length) {
            const firstText = event.message.content.find(c => c.type === 'text')?.text;
            if (firstText) return firstText;
          }
        }
        return fallback || '';
      };

      const lastPrompt = lastPromptRef.current;
      const userPrompt = extractUserPrompt(prev.currentTurnEvents, lastPrompt?.text);
      const assistantResponse = normalizeAssistantResponse(
        undefined,
        extractAssistantMessageContentFromStreamEvents(prev.currentTurnEvents),
      );

      const completedTurn: TurnInfo = normalizeTurnInfo({
        id: payload.turn_id,
        turn_index: payload.turn_index,
        user_prompt: userPrompt,
        prompt_source: (lastPrompt?.source || 'user') as TurnInfo['prompt_source'],
        assistant_response: assistantResponse,
        model: payload.model,
        input_tokens: payload.input_tokens,
        output_tokens: payload.output_tokens,
        cost_usd: payload.cost_usd,
        duration_ms: payload.duration_ms,
        state: payload.state as TurnInfo['state'],
        error_message: payload.error_message,
        created_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      });

      const existingIndex = prev.turns.findIndex(t => t.id === payload.turn_id);
      let newTurns: TurnInfo[];
      
      if (existingIndex >= 0) {
        newTurns = [...prev.turns];
        const existing = newTurns[existingIndex];
        newTurns[existingIndex] = normalizeTurnInfo({
          ...existing,
          ...completedTurn,
          user_prompt: existing.user_prompt || completedTurn.user_prompt,
          prompt_source: existing.prompt_source || completedTurn.prompt_source,
          assistant_response: completedTurn.assistant_response ?? existing.assistant_response,
          created_at: existing.created_at,
          completed_at: existing.completed_at || completedTurn.completed_at,
        });
      } else {
        newTurns = [...prev.turns, completedTurn];
      }

      return {
        ...prev,
        turns: newTurns,
        currentTurnEvents: [],
        currentTurnId: null,
        state: payload.state === 'error' ? 'error' : 'idle',
      };
    });
  }, [safeSetState]);

  // 处理 error 消息
  const handleError = useCallback((payload: ErrorPayload) => {
    safeSetState(prev => ({
      ...prev,
      error: payload.message,
      state: 'error',
    }));
    onError?.(payload.code, payload.message);
  }, [safeSetState, onError]);

  // 处理 mode_switched 消息
  const handleModeSwitched = useCallback((payload: ModeSwitchedPayload) => {
    onModeSwitch?.(payload.mode, payload.closed_sessions);
  }, [onModeSwitch]);

  // 消息处理器
  const handleMessage = useCallback((type: HeadlessResponseType, payload: unknown) => {
    switch (type) {
      case 'session_info':
        if (isSessionInfo(payload)) {
          handleSessionInfo(payload);
        }
        break;
      case 'no_session':
        // 清除 ignoreAutoRecovery 标志（没有旧会话需要忽略）
        ignoreAutoRecoveryRef.current = false;
        safeSetState(prev => ({
          ...prev,
          sessionId: null,
          state: 'idle',
        }));
        break;
      case 'history':
        if (isHistoryPayload(payload)) {
          handleHistory(payload, false);
        }
        break;
      case 'history_more':
        if (isHistoryPayload(payload)) {
          handleHistory(payload, true);
        }
        break;
      case 'event':
        if (isStreamEvent(payload)) {
          handleEvent(payload);
        }
        break;
      case 'turn_complete':
        if (isTurnCompletePayload(payload)) {
          handleTurnComplete(payload);
        }
        break;
      case 'error':
        if (isErrorPayload(payload)) {
          handleError(payload);
        }
        break;
      case 'mode_switched':
        if (isModeSwitchedPayload(payload)) {
          handleModeSwitched(payload);
        }
        break;
      case 'queue_update':
        if (isQueueUpdatePayload(payload)) {
          safeSetState(prev => ({
            ...prev,
            queuedTurns: payload.queued_turns,
          }));
        }
        break;
      case 'pty_closed':
        break;
      case 'pong':
        break;
    }
  }, [handleSessionInfo, handleHistory, handleEvent, handleTurnComplete, handleError, handleModeSwitched, safeSetState]);

  // 标记下次 session_info 为自动恢复，不触发 onSessionCreated
  const prepareForNewSession = useCallback(() => {
    ignoreAutoRecoveryRef.current = true;
  }, []);

  // 连接状态处理器（带 grace period 防止断连闪烁）
  const handleWsConnect = useCallback(() => {
    // 连接成功时，取消 grace period
    if (disconnectGraceTimerRef.current) {
      clearTimeout(disconnectGraceTimerRef.current);
      disconnectGraceTimerRef.current = null;
    }
    safeSetState(prev => ({
      ...prev,
      connected: true,
      connecting: false,
      error: null,
    }));
  }, [safeSetState]);

  const handleWsDisconnect = useCallback(() => {
    // 使用 grace period 延迟设置断连状态，防止短暂断连导致 UI 闪烁
    if (disconnectGraceTimerRef.current) {
      clearTimeout(disconnectGraceTimerRef.current);
    }
    disconnectGraceTimerRef.current = setTimeout(() => {
      disconnectGraceTimerRef.current = null;
      safeSetState(prev => ({
        ...prev,
        connected: false,
        connecting: false,
      }));
    }, 1500); // 1.5 秒 grace period
  }, [safeSetState]);

  const handleWsError = useCallback(() => {
    safeSetState(prev => ({
      ...prev,
      connecting: false,
    }));
  }, [safeSetState]);

  // 连接到指定的 conversationId
  const connectToConversation = useCallback(async (targetConversationId: number) => {
    if (connectingRef.current) {
      return;
    }

    // 如果已经连接到这个对话，不需要重连
    if (wsRef.current?.isConnected() && connectedConversationId === targetConversationId) {
      return;
    }

    // 断开现有连接
    if (wsRef.current) {
      wsRef.current.disconnect();
      wsRef.current = null;
    }

    connectingRef.current = true;
    setConnectedConversationId(targetConversationId);

    // 重置状态（包括清空队列，防止旧对话队列泄漏到新对话）
    safeSetState(prev => ({
      ...prev,
      connecting: true,
      error: null,
      turns: [],
      currentTurnEvents: [],
      queuedTurns: [],
      sessionId: null,
      conversationId: targetConversationId,
    }));

    try {
      const ws = new HeadlessWebSocketService({ conversationId: targetConversationId });
      ws.setMessageHandler(handleMessage);
      ws.setConnectionHandlers({
        onConnect: handleWsConnect,
        onDisconnect: handleWsDisconnect,
        onError: handleWsError,
      });
      wsRef.current = ws;
      await ws.connect();

      handleWsConnect();
    } catch (error) {
      wsRef.current?.disconnect();
      wsRef.current = null;
      setConnectedConversationId(null);
      safeSetState(prev => ({
        ...prev,
        connected: false,
        connecting: false,
        error: error instanceof Error ? error.message : 'Connection failed',
      }));
    } finally {
      connectingRef.current = false;
    }
  }, [handleMessage, handleWsConnect, handleWsDisconnect, handleWsError, safeSetState, connectedConversationId]);

  // 连接到容器（旧模式，用于创建新会话）
  const connectToContainer = useCallback(async (targetContainerId: number) => {
    if (connectingRef.current) {
      return;
    }
    if (wsRef.current?.isConnected()) {
      safeSetState(prev => ({
        ...prev,
        connected: true,
        connecting: false,
        error: null,
      }));
      return;
    }
    if (wsRef.current) {
      wsRef.current.disconnect();
      wsRef.current = null;
    }

    connectingRef.current = true;
    setConnectedConversationId(null);
    safeSetState(prev => ({ ...prev, connecting: true, error: null }));

    try {
      const ws = new HeadlessWebSocketService({ containerId: targetContainerId });
      ws.setMessageHandler(handleMessage);
      ws.setConnectionHandlers({
        onConnect: handleWsConnect,
        onDisconnect: handleWsDisconnect,
        onError: handleWsError,
      });
      wsRef.current = ws;
      await ws.connect();

      handleWsConnect();
    } catch (error) {
      wsRef.current?.disconnect();
      wsRef.current = null;
      safeSetState(prev => ({
        ...prev,
        connected: false,
        connecting: false,
        error: error instanceof Error ? error.message : 'Connection failed',
      }));
    } finally {
      connectingRef.current = false;
    }
  }, [handleMessage, handleWsConnect, handleWsDisconnect, handleWsError, safeSetState]);

  // 断开连接（主动断开，无需 grace period）
  const disconnect = useCallback(() => {
    // 取消 grace period timer
    if (disconnectGraceTimerRef.current) {
      clearTimeout(disconnectGraceTimerRef.current);
      disconnectGraceTimerRef.current = null;
    }
    wsRef.current?.disconnect();
    wsRef.current = null;
    setConnectedConversationId(null);
    safeSetState(prev => ({
      ...prev,
      connected: false,
      connecting: false,
      queuedTurns: [],
    }));
  }, [safeSetState]);

  // 创建会话
  const startSession = useCallback((workDir?: string, forceNew?: boolean) => {
    if (!wsRef.current?.isConnected()) {
      console.error('[useHeadlessSession] WebSocket not connected');
      return;
    }
    // 重置状态以准备新会话
    if (forceNew) {
      safeSetState(prev => ({
        ...prev,
        sessionId: null,
        conversationId: null,
        currentTurnId: null,
        turns: [],
        currentTurnEvents: [],
        hasMoreHistory: false,
      }));
    }
    wsRef.current.startSession(workDir, forceNew);
  }, [safeSetState]);

  // 发送 prompt（支持队列：运行中发送的消息会被后端加入队列）
  const sendPrompt = useCallback((prompt: string, source: string = 'user', model?: string) => {
    if (!wsRef.current?.isConnected()) {
      console.error('[useHeadlessSession] WebSocket not connected');
      return;
    }

    lastPromptRef.current = { text: prompt, source };

    // 如果 session 空闲，显示即时反馈
    if (state.state !== 'running') {
      const syntheticUserEvent: StreamEvent = {
        type: 'user',
        message: {
          content: [
            { type: 'text', text: prompt },
          ],
        },
      };

      safeSetState(prev => ({
        ...prev,
        currentTurnEvents: [syntheticUserEvent],
        state: 'running',
        error: null,
      }));
    }
    // 如果正在运行，消息会被后端入队，不需要前端做特殊处理

    if (!state.sessionId) {
      console.log('[useHeadlessSession] No session, setting pending prompt');
      pendingPromptRef.current = { text: prompt, source };
      return;
    }

    wsRef.current.sendPrompt(prompt, source, model);
  }, [safeSetState, state.sessionId, state.state]);

  // 取消执行
  const cancelExecution = useCallback(() => {
    if (!wsRef.current?.isConnected()) {
      return;
    }
    wsRef.current.cancelExecution();
  }, []);

  // 加载更多历史
  const loadMoreHistory = useCallback((limit: number = 10) => {
    if (!wsRef.current?.isConnected() || state.loadingHistory || !state.hasMoreHistory) {
      return;
    }

    const oldestTurn = state.turns[0];
    if (!oldestTurn) {
      return;
    }

    safeSetState(prev => ({ ...prev, loadingHistory: true }));
    wsRef.current.loadMoreHistory(oldestTurn.id, limit);
  }, [state.loadingHistory, state.hasMoreHistory, state.turns, safeSetState]);

  // 切换模式
  const switchMode = useCallback((mode: 'tui' | 'headless') => {
    if (!wsRef.current?.isConnected()) {
      return;
    }
    wsRef.current.switchMode(mode);
  }, []);

  // 删除排队中的消息
  const deleteQueuedTurn = useCallback((turnId: number) => {
    if (!wsRef.current?.isConnected()) return;
    wsRef.current.deleteQueuedTurn(turnId);
  }, []);

  // 编辑排队中的消息
  const editQueuedTurn = useCallback((turnId: number, newPrompt: string) => {
    if (!wsRef.current?.isConnected()) return;
    wsRef.current.editQueuedTurn(turnId, newPrompt);
  }, []);

  // 清除错误
  const clearError = useCallback(() => {
    safeSetState(prev => ({ ...prev, error: null }));
  }, [safeSetState]);

  // 重置状态
  const reset = useCallback(() => {
    safeSetState(() => initialState);
  }, [safeSetState]);

  // 组件卸载时清理
  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      if (disconnectGraceTimerRef.current) {
        clearTimeout(disconnectGraceTimerRef.current);
        disconnectGraceTimerRef.current = null;
      }
      wsRef.current?.disconnect();
      wsRef.current = null;
    };
  }, []);

  // 自动连接（如果启用）
  useEffect(() => {
    if (!autoConnect) return;
    
    if (conversationId) {
      const timer = setTimeout(() => {
        if (mountedRef.current && !wsRef.current?.isConnected() && !connectingRef.current) {
          connectToConversation(conversationId);
        }
      }, 100);
      return () => clearTimeout(timer);
    } else if (containerId) {
      const timer = setTimeout(() => {
        if (mountedRef.current && !wsRef.current?.isConnected() && !connectingRef.current) {
          connectToContainer(containerId);
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [autoConnect, containerId, conversationId, connectToConversation, connectToContainer]);

  return {
    // 状态
    ...state,
    connectedConversationId,
    
    // 操作
    connectToConversation,
    connectToContainer,
    disconnect,
    startSession,
    prepareForNewSession,
    sendPrompt,
    cancelExecution,
    deleteQueuedTurn,
    editQueuedTurn,
    loadMoreHistory,
    switchMode,
    clearError,
    reset,
    
    // 工具
    isRunning: state.state === 'running',
    isIdle: state.state === 'idle',
    hasSession: state.sessionId !== null,
  };
}

export type UseHeadlessSessionReturn = ReturnType<typeof useHeadlessSession>;
