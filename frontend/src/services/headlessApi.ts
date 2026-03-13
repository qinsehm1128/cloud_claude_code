import api from './api'
import { normalizeTurnInfo, type TurnInfo } from '../types/headless'

export type { TurnInfo } from '../types/headless'

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

export interface TurnsResponse {
  turns: TurnInfo[]
  has_more: boolean
}

function normalizeTurnsResponse(data: TurnsResponse): TurnsResponse {
  return {
    ...data,
    turns: (data.turns || []).map(normalizeTurnInfo),
  }
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
    }).then(response => ({
      ...response,
      data: normalizeTurnsResponse(response.data),
    })),
}

export default headlessApi
