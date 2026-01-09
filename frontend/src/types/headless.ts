// Headless Card Mode Types

// 会话状态
export type HeadlessState = 'running' | 'idle' | 'error' | 'closed';

// Stream 事件类型
export interface StreamEvent {
  type: 'system' | 'assistant' | 'user' | 'result';
  subtype?: string;
  session_id?: string;
  model?: string;
  cwd?: string;
  tools?: string[];
  message?: MessagePayload;
  result?: string;
  error?: string;
  is_error?: boolean;
  usage?: UsageInfo;
  cost_usd?: number;
  duration_ms?: number;
  is_meta?: boolean;
}

// 消息负载
export interface MessagePayload {
  content: MessageContent[];
  usage?: UsageInfo;
}

// 消息内容
export interface MessageContent {
  type: 'text' | 'thinking' | 'tool_use' | 'tool_result';
  text?: string;
  thinking?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: unknown;
  is_error?: boolean;
}

// Token 使用信息
export interface UsageInfo {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

// 轮次信息
export interface TurnInfo {
  id: number;
  turn_index: number;
  user_prompt: string;
  prompt_source: 'user' | 'strategy' | 'monitoring';
  assistant_response?: string;
  model?: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  duration_ms: number;
  state: 'pending' | 'running' | 'completed' | 'error';
  error_message?: string;
  created_at: string;
  completed_at?: string;
  events?: EventInfo[];
}

// 事件信息
export interface EventInfo {
  id: number;
  event_index: number;
  event_type: string;
  event_subtype?: string;
  raw_json: string;
  created_at: string;
}

// 会话信息
export interface SessionInfo {
  session_id: string;
  claude_session_id?: string;
  state: HeadlessState;
  conversation_id: number;
  current_turn_id?: number;
}

// 历史记录负载
export interface HistoryPayload {
  turns: TurnInfo[];
  has_more: boolean;
}

// 轮次完成负载
export interface TurnCompletePayload {
  turn_id: number;
  turn_index: number;
  model?: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  duration_ms: number;
  state: string;
  error_message?: string;
}

// 错误负载
export interface ErrorPayload {
  code: string;
  message: string;
}

// 模式切换负载
export interface ModeSwitchedPayload {
  mode: 'tui' | 'headless';
  closed_sessions: number;
}

// WebSocket 请求类型
export type HeadlessRequestType =
  | 'headless_start'
  | 'headless_prompt'
  | 'headless_cancel'
  | 'load_more'
  | 'mode_switch'
  | 'ping';

// WebSocket 响应类型
export type HeadlessResponseType =
  | 'session_info'
  | 'no_session'
  | 'history'
  | 'history_more'
  | 'event'
  | 'turn_complete'
  | 'error'
  | 'mode_switched'
  | 'pty_closed'
  | 'pong';

// WebSocket 请求
export interface HeadlessRequest {
  type: HeadlessRequestType;
  payload?: Record<string, unknown>;
}

// WebSocket 响应
export interface HeadlessResponse {
  type: HeadlessResponseType;
  payload: unknown;
}

// 前端状态
export interface HeadlessSessionState {
  sessionId: string | null;
  claudeSessionId: string | null;
  state: HeadlessState;
  conversationId: number | null;
  currentTurnId: number | null;
  
  // 对话历史
  turns: TurnInfo[];
  hasMoreHistory: boolean;
  loadingHistory: boolean;
  
  // 当前轮次的实时输出
  currentTurnEvents: StreamEvent[];
  
  // WebSocket 连接状态
  connected: boolean;
  connecting: boolean;
  error: string | null;
}

// 错误代码
export const ErrorCodes = {
  INVALID_REQUEST: 'invalid_request',
  SESSION_NOT_FOUND: 'session_not_found',
  SESSION_BUSY: 'session_busy',
  PROCESS_FAILED: 'process_failed',
  MODE_CONFLICT: 'mode_conflict',
  INTERNAL_ERROR: 'internal_error',
} as const;

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];
