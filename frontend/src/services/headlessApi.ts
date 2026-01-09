import api from './api'

// ==================== Types ====================

export interface Conversation {
  id: number
  container_id: number
  session_id: string
  claude_session_id?: string
  title?: string
  state: string
  is_running: boolean  // 后端会话是否正在运行
  total_turns: number
  created_at: string
  updated_at: string
}

export interface TurnInfo {
  id: number
  turn_index: number
  user_prompt: string
  prompt_source: 'user' | 'strategy' | 'monitoring'
  assistant_response?: string
  model?: string
  input_tokens: number
  output_tokens: number
  cost_usd: number
  duration_ms: number
  state: 'pending' | 'running' | 'completed' | 'error'
  error_message?: string
  created_at: string
  completed_at?: string
}

export interface TurnsResponse {
  turns: TurnInfo[]
  has_more: boolean
}

// ==================== Headless API ====================

export const headlessApi = {
  listConversations: (containerId: number) =>
    api.get<Conversation[]>(`/containers/${containerId}/headless/conversations`),

  getConversation: (containerId: number, conversationId: number) =>
    api.get<Conversation>(`/containers/${containerId}/headless/conversations/${conversationId}`),

  deleteConversation: (containerId: number, conversationId: number) =>
    api.delete(`/containers/${containerId}/headless/conversations/${conversationId}`),

  getConversationTurns: (containerId: number, conversationId: number, limit?: number, before?: number) =>
    api.get<TurnsResponse>(`/containers/${containerId}/headless/conversations/${conversationId}/turns`, {
      params: { limit, before },
    }),
}

export default headlessApi
