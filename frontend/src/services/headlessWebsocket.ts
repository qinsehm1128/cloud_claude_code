import type {
  HeadlessRequest,
  HeadlessResponse,
  HeadlessResponseType,
  SessionInfo,
  HistoryPayload,
  StreamEvent,
  TurnCompletePayload,
  ErrorPayload,
  ModeSwitchedPayload,
} from '../types/headless';

type MessageHandler = (type: HeadlessResponseType, payload: unknown) => void;
type ConnectionHandler = () => void;
type DisconnectHandler = (code: number, reason: string) => void;
type ErrorHandler = (error: Event) => void;

// Helper to get cookie value
function getCookie(name: string): string | null {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) {
    return parts.pop()?.split(';').shift() || null;
  }
  return null;
}

export type WebSocketMode = 'container' | 'conversation';

export class HeadlessWebSocketService {
  private ws: WebSocket | null = null;
  private mode: WebSocketMode;
  private containerId?: number;
  private conversationId?: number;
  private messageHandler: MessageHandler | null = null;
  private onConnect: ConnectionHandler | null = null;
  private onDisconnect: DisconnectHandler | null = null;
  private onError: ErrorHandler | null = null;
  private connecting = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private isClosing = false;

  constructor(options: { containerId: number } | { conversationId: number }) {
    if ('containerId' in options) {
      this.mode = 'container';
      this.containerId = options.containerId;
    } else {
      this.mode = 'conversation';
      this.conversationId = options.conversationId;
    }
  }

  // 获取当前连接的 conversationId（如果是 conversation 模式）
  getConversationId(): number | undefined {
    return this.conversationId;
  }

  // 连接 WebSocket
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }
      if (this.connecting) {
        resolve();
        return;
      }

      this.isClosing = false;
      this.connecting = true;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      
      // 根据模式构建 URL
      let url: string;
      if (this.mode === 'container') {
        url = `${protocol}//${host}/api/ws/headless/${this.containerId}`;
      } else {
        url = `${protocol}//${host}/api/ws/headless/conversation/${this.conversationId}`;
      }

      // Try to attach token if cookie is readable (same-origin non-httpOnly)
      const token = getCookie('cc_token');
      if (token) {
        const params = new URLSearchParams();
        params.set('token', token);
        url += `?${params.toString()}`;
      }

      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        console.log('[HeadlessWS] Connected', this.mode, this.mode === 'container' ? this.containerId : this.conversationId);
        this.reconnectAttempts = 0;
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }
        this.startPing();
        this.connecting = false;
        this.onConnect?.();
        resolve();
      };

      this.ws.onclose = (event) => {
        console.log('[HeadlessWS] Disconnected', event.code, event.reason);
        this.stopPing();
        this.connecting = false;
        this.ws = null;
        this.onDisconnect?.(event.code, event.reason || '');
        
        if (!this.isClosing && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = (error) => {
        console.error('[HeadlessWS] Error', error);
        this.connecting = false;
        this.onError?.(error);
        reject(error);
      };

      this.ws.onmessage = (event) => {
        try {
          const response: HeadlessResponse = JSON.parse(event.data);
          this.handleMessage(response);
        } catch (error) {
          console.error('[HeadlessWS] Failed to parse message', error);
        }
      };
    });
  }

  // 断开连接
  disconnect(): void {
    this.isClosing = true;
    this.stopPing();
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  // 设置消息处理器
  setMessageHandler(handler: MessageHandler): void {
    this.messageHandler = handler;
  }

  // 设置连接状态处理器
  setConnectionHandlers(handlers: {
    onConnect?: ConnectionHandler;
    onDisconnect?: DisconnectHandler;
    onError?: ErrorHandler;
  }): void {
    this.onConnect = handlers.onConnect || null;
    this.onDisconnect = handlers.onDisconnect || null;
    this.onError = handlers.onError || null;
  }

  // 发送消息
  send(request: HeadlessRequest): void {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      console.error('[HeadlessWS] WebSocket not connected');
      return;
    }

    this.ws.send(JSON.stringify(request));
  }

  // 创建会话
  startSession(workDir?: string): void {
    this.send({
      type: 'headless_start',
      payload: workDir ? { work_dir: workDir } : {},
    });
  }

  // 发送 prompt
  sendPrompt(prompt: string, source: string = 'user', model?: string): void {
    const payload: { prompt: string; source: string; model?: string } = { prompt, source };
    if (model) {
      payload.model = model;
    }
    this.send({
      type: 'headless_prompt',
      payload,
    });
  }

  // 取消执行
  cancelExecution(): void {
    this.send({
      type: 'headless_cancel',
      payload: {},
    });
  }

  // 加载更多历史
  loadMoreHistory(beforeTurnId: number, limit: number = 3): void {
    this.send({
      type: 'load_more',
      payload: { before_turn_id: beforeTurnId, limit },
    });
  }

  // 切换模式
  switchMode(mode: 'tui' | 'headless'): void {
    this.send({
      type: 'mode_switch',
      payload: { mode },
    });
  }

  // 检查连接状态
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  // 处理消息
  private handleMessage(response: HeadlessResponse): void {
    if (this.messageHandler) {
      this.messageHandler(response.type, response.payload);
    }
  }

  // 开始心跳
  private startPing(): void {
    this.pingInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        // 发送 ping 消息保持连接活跃
        this.send({ type: 'ping', payload: {} });
      }
    }, 30000);
  }

  // 停止心跳
  private stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  // 安排重连
  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      return;
    }
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    
    console.log(`[HeadlessWS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch((error) => {
        console.error('[HeadlessWS] Reconnect failed', error);
      });
    }, delay);
  }
}

// 类型守卫函数
export function isSessionInfo(payload: unknown): payload is SessionInfo {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'session_id' in payload &&
    'state' in payload
  );
}

export function isHistoryPayload(payload: unknown): payload is HistoryPayload {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'turns' in payload &&
    'has_more' in payload
  );
}

export function isStreamEvent(payload: unknown): payload is StreamEvent {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'type' in payload
  );
}

export function isTurnCompletePayload(payload: unknown): payload is TurnCompletePayload {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'turn_id' in payload &&
    'turn_index' in payload
  );
}

export function isErrorPayload(payload: unknown): payload is ErrorPayload {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'code' in payload &&
    'message' in payload
  );
}

export function isModeSwitchedPayload(payload: unknown): payload is ModeSwitchedPayload {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'mode' in payload &&
    'closed_sessions' in payload
  );
}
