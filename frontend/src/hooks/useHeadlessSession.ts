import { useState, useEffect, useCallback, useRef } from 'react';
import {
  HeadlessWebSocketService,
  isSessionInfo,
  isHistoryPayload,
  isStreamEvent,
  isTurnCompletePayload,
  isErrorPayload,
  isModeSwitchedPayload,
} from '../services/headlessWebsocket';
import type {
  HeadlessSessionState,
  HeadlessResponseType,
  TurnInfo,
  StreamEvent,
  SessionInfo,
  HistoryPayload,
  TurnCompletePayload,
  ErrorPayload,
  ModeSwitchedPayload,
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
}

export function useHeadlessSession(options: UseHeadlessSessionOptions) {
  const { containerId, conversationId, autoConnect = false, onModeSwitch, onError } = options;
  
  const [state, setState] = useState<HeadlessSessionState>(initialState);
  const [connectedConversationId, setConnectedConversationId] = useState<number | null>(null);
  const wsRef = useRef<HeadlessWebSocketService | null>(null);
  const mountedRef = useRef(true);
  const connectingRef = useRef(false);
  const lastPromptRef = useRef<{ text: string; source: string } | null>(null);
  const pendingPromptRef = useRef<{ text: string; source: string } | null>(null);

  // 安全的状态更新
  const safeSetState = useCallback((updater: (prev: HeadlessSessionState) => HeadlessSessionState) => {
    if (mountedRef.current) {
      setState(updater);
    }
  }, []);

  // 处理 session_info 消息
  const handleSessionInfo = useCallback((payload: SessionInfo) => {
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
  }, [safeSetState]);

  // 处理 history 消息
  const handleHistory = useCallback((payload: HistoryPayload, isMore: boolean) => {
    safeSetState(prev => {
      const newTurns = isMore
        ? [...payload.turns, ...prev.turns]
        : payload.turns;
      
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

      const extractAssistantResponse = (events: StreamEvent[]) => {
        const texts: string[] = [];
        for (const event of events) {
          if (event.type === 'assistant' && event.message?.content?.length) {
            for (const c of event.message.content) {
              if (c.type === 'text' && c.text) {
                texts.push(c.text);
              } else if (c.type === 'thinking' && c.thinking) {
                texts.push(`[Thinking] ${c.thinking}`);
              }
            }
          }
        }
        return texts.join('\n');
      };

      const lastPrompt = lastPromptRef.current;
      const userPrompt = extractUserPrompt(prev.currentTurnEvents, lastPrompt?.text);
      const assistantResponse = extractAssistantResponse(prev.currentTurnEvents);

      const completedTurn: TurnInfo = {
        id: payload.turn_id,
        turn_index: payload.turn_index,
        user_prompt: userPrompt,
        prompt_source: (lastPrompt?.source || 'user') as TurnInfo['prompt_source'],
        assistant_response: assistantResponse || undefined,
        model: payload.model,
        input_tokens: payload.input_tokens,
        output_tokens: payload.output_tokens,
        cost_usd: payload.cost_usd,
        duration_ms: payload.duration_ms,
        state: payload.state as TurnInfo['state'],
        error_message: payload.error_message,
        created_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      };

      const existingIndex = prev.turns.findIndex(t => t.id === payload.turn_id);
      let newTurns: TurnInfo[];
      
      if (existingIndex >= 0) {
        newTurns = [...prev.turns];
        const existing = newTurns[existingIndex];
        newTurns[existingIndex] = {
          ...existing,
          ...completedTurn,
          user_prompt: existing.user_prompt || completedTurn.user_prompt,
          prompt_source: existing.prompt_source || completedTurn.prompt_source,
          created_at: existing.created_at,
          completed_at: existing.completed_at || completedTurn.completed_at,
        };
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
      case 'pty_closed':
        break;
      case 'pong':
        break;
    }
  }, [handleSessionInfo, handleHistory, handleEvent, handleTurnComplete, handleError, handleModeSwitched, safeSetState]);

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
    
    // 重置状态
    safeSetState(prev => ({ 
      ...prev, 
      connecting: true, 
      error: null,
      turns: [],
      currentTurnEvents: [],
      sessionId: null,
      conversationId: targetConversationId,
    }));

    try {
      const ws = new HeadlessWebSocketService({ conversationId: targetConversationId });
      ws.setMessageHandler(handleMessage);
      ws.setConnectionHandlers({
        onConnect: () => {
          safeSetState(prev => ({
            ...prev,
            connected: true,
            connecting: false,
            error: null,
          }));
        },
        onDisconnect: () => {
          safeSetState(prev => ({
            ...prev,
            connected: false,
            connecting: false,
          }));
        },
        onError: () => {
          safeSetState(prev => ({
            ...prev,
            connecting: false,
          }));
        },
      });
      wsRef.current = ws;
      await ws.connect();
      
      safeSetState(prev => ({
        ...prev,
        connected: true,
        connecting: false,
      }));
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
  }, [handleMessage, safeSetState, connectedConversationId]);

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
        onConnect: () => {
          safeSetState(prev => ({
            ...prev,
            connected: true,
            connecting: false,
            error: null,
          }));
        },
        onDisconnect: () => {
          safeSetState(prev => ({
            ...prev,
            connected: false,
            connecting: false,
          }));
        },
        onError: () => {
          safeSetState(prev => ({
            ...prev,
            connecting: false,
          }));
        },
      });
      wsRef.current = ws;
      await ws.connect();
      
      safeSetState(prev => ({
        ...prev,
        connected: true,
        connecting: false,
      }));
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
  }, [handleMessage, safeSetState]);

  // 断开连接
  const disconnect = useCallback(() => {
    wsRef.current?.disconnect();
    wsRef.current = null;
    setConnectedConversationId(null);
    safeSetState(prev => ({
      ...prev,
      connected: false,
      connecting: false,
    }));
  }, [safeSetState]);

  // 创建会话
  const startSession = useCallback((workDir?: string) => {
    if (!wsRef.current?.isConnected()) {
      console.error('[useHeadlessSession] WebSocket not connected');
      return;
    }
    wsRef.current.startSession(workDir);
  }, []);

  // 发送 prompt
  const sendPrompt = useCallback((prompt: string, source: string = 'user', model?: string) => {
    if (!wsRef.current?.isConnected()) {
      console.error('[useHeadlessSession] WebSocket not connected');
      return;
    }

    if (state.state === 'running') {
      console.warn('[useHeadlessSession] Session is busy, cannot send prompt');
      return;
    }

    const syntheticUserEvent: StreamEvent = {
      type: 'user',
      message: {
        content: [
          { type: 'text', text: prompt },
        ],
      },
    };

    lastPromptRef.current = { text: prompt, source };

    safeSetState(prev => ({
      ...prev,
      currentTurnEvents: [syntheticUserEvent],
      state: 'running',
      error: null,
    }));

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
    sendPrompt,
    cancelExecution,
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
