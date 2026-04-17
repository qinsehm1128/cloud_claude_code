export interface ConversationInfo {
  id: number
  title?: string
  state: string
  is_running: boolean
  total_turns: number
  created_at: string
  updated_at: string
}

export interface TerminalSessionInfo {
  id: string
  container_id: string
  width: number
  height: number
  client_count: number
  created_at: string
  last_active: string
  running: boolean
}


