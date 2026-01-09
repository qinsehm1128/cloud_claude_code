package headless

// HeadlessState 表示 Headless 会话状态
type HeadlessState string

const (
	HeadlessStateRunning HeadlessState = "running" // Claude 进程正在执行
	HeadlessStateIdle    HeadlessState = "idle"    // 等待用户输入
	HeadlessStateError   HeadlessState = "error"   // 发生错误
	HeadlessStateClosed  HeadlessState = "closed"  // 会话已关闭
)

// StreamEvent 表示 Claude stream-json 输出的一个事件
type StreamEvent struct {
	Type      string          `json:"type"`                  // system | assistant | user | result
	Subtype   string          `json:"subtype,omitempty"`     // 子类型
	SessionID string          `json:"session_id,omitempty"`  // Claude 会话 ID
	Model     string          `json:"model,omitempty"`       // 模型名称
	CWD       string          `json:"cwd,omitempty"`         // 当前工作目录
	Tools     []string        `json:"tools,omitempty"`       // 可用工具列表
	Message   *MessagePayload `json:"message,omitempty"`     // 消息内容
	Result    string          `json:"result,omitempty"`      // 结果文本
	Error     string          `json:"error,omitempty"`       // 错误信息
	IsError   bool            `json:"is_error,omitempty"`    // 是否为错误
	Usage     *UsageInfo      `json:"usage,omitempty"`       // Token 使用信息
	Cost      float64         `json:"cost_usd,omitempty"`    // 费用（美元）
	Duration  int64           `json:"duration_ms,omitempty"` // 持续时间（毫秒）

	// 内部字段
	Raw    string `json:"-"`                 // 原始 JSON 行
	IsMeta bool   `json:"is_meta,omitempty"` // 是否为元数据事件
}

// MessagePayload 表示消息负载
type MessagePayload struct {
	Content []MessageContent `json:"content"`         // 消息内容列表
	Usage   *UsageInfo       `json:"usage,omitempty"` // Token 使用信息
}

// MessageContent 表示消息内容项
type MessageContent struct {
	Type      string                 `json:"type"`                  // text | thinking | tool_use | tool_result
	Text      string                 `json:"text,omitempty"`        // 文本内容
	Thinking  string                 `json:"thinking,omitempty"`    // 思考内容
	ID        string                 `json:"id,omitempty"`          // tool_use id
	Name      string                 `json:"name,omitempty"`        // 工具名称
	Input     map[string]interface{} `json:"input,omitempty"`       // 工具输入
	ToolUseID string                 `json:"tool_use_id,omitempty"` // tool_result 关联的 tool_use id
	Content   interface{}            `json:"content,omitempty"`     // tool_result 内容
	IsError   bool                   `json:"is_error,omitempty"`    // tool_result 是否为错误
}

// UsageInfo 表示 Token 使用信息
type UsageInfo struct {
	InputTokens         int `json:"input_tokens"`
	OutputTokens        int `json:"output_tokens"`
	CacheCreationTokens int `json:"cache_creation_input_tokens,omitempty"`
	CacheReadTokens     int `json:"cache_read_input_tokens,omitempty"`
}

// StreamEvent 类型常量
const (
	StreamEventTypeSystem    = "system"
	StreamEventTypeAssistant = "assistant"
	StreamEventTypeUser      = "user"
	StreamEventTypeResult    = "result"
)

// MessageContent 类型常量
const (
	MessageContentTypeText       = "text"
	MessageContentTypeThinking   = "thinking"
	MessageContentTypeToolUse    = "tool_use"
	MessageContentTypeToolResult = "tool_result"
)

// ==================== WebSocket 消息类型 ====================

// HeadlessRequest 客户端 → 服务器的消息
type HeadlessRequest struct {
	Type    string                 `json:"type"`    // 消息类型
	Payload map[string]interface{} `json:"payload"` // 消息负载
}

// HeadlessResponse 服务器 → 客户端的消息
type HeadlessResponse struct {
	Type    string      `json:"type"`    // 消息类型
	Payload interface{} `json:"payload"` // 消息负载
}

// 客户端请求类型常量
const (
	// HeadlessRequestTypeStart 创建新会话
	HeadlessRequestTypeStart = "headless_start"
	// HeadlessRequestTypePrompt 发送 prompt
	HeadlessRequestTypePrompt = "headless_prompt"
	// HeadlessRequestTypeCancel 取消执行
	HeadlessRequestTypeCancel = "headless_cancel"
	// HeadlessRequestTypeLoadMore 加载更多历史
	HeadlessRequestTypeLoadMore = "load_more"
	// HeadlessRequestTypeModeSwitch 模式切换
	HeadlessRequestTypeModeSwitch = "mode_switch"
	// HeadlessRequestTypePing 心跳
	HeadlessRequestTypePing = "ping"
)

// 服务器响应类型常量
const (
	// HeadlessResponseTypeSessionInfo 会话信息
	HeadlessResponseTypeSessionInfo = "session_info"
	// HeadlessResponseTypeNoSession 无活跃会话
	HeadlessResponseTypeNoSession = "no_session"
	// HeadlessResponseTypeHistory 历史记录
	HeadlessResponseTypeHistory = "history"
	// HeadlessResponseTypeHistoryMore 更多历史记录
	HeadlessResponseTypeHistoryMore = "history_more"
	// HeadlessResponseTypeEvent 流式事件
	HeadlessResponseTypeEvent = "event"
	// HeadlessResponseTypeTurnComplete 轮次完成
	HeadlessResponseTypeTurnComplete = "turn_complete"
	// HeadlessResponseTypeError 错误
	HeadlessResponseTypeError = "error"
	// HeadlessResponseTypeModeSwitched 模式已切换
	HeadlessResponseTypeModeSwitched = "mode_switched"
	// HeadlessResponseTypePTYClosed PTY 已关闭
	HeadlessResponseTypePTYClosed = "pty_closed"
	// HeadlessResponseTypePong 心跳响应
	HeadlessResponseTypePong = "pong"
)

// SessionInfoPayload 会话信息负载
type SessionInfoPayload struct {
	SessionID       string        `json:"session_id"`
	ClaudeSessionID string        `json:"claude_session_id,omitempty"`
	State           HeadlessState `json:"state"`
	ConversationID  uint          `json:"conversation_id"`
	CurrentTurnID   uint          `json:"current_turn_id,omitempty"`
}

// HistoryPayload 历史记录负载
type HistoryPayload struct {
	Turns   []TurnInfo `json:"turns"`
	HasMore bool       `json:"has_more"`
}

// TurnInfo 轮次信息（用于前端展示）
type TurnInfo struct {
	ID                uint        `json:"id"`
	TurnIndex         int         `json:"turn_index"`
	UserPrompt        string      `json:"user_prompt"`
	PromptSource      string      `json:"prompt_source"`
	AssistantResponse string      `json:"assistant_response,omitempty"`
	Model             string      `json:"model,omitempty"`
	InputTokens       int         `json:"input_tokens"`
	OutputTokens      int         `json:"output_tokens"`
	CostUSD           float64     `json:"cost_usd"`
	DurationMS        int64       `json:"duration_ms"`
	State             string      `json:"state"`
	ErrorMessage      string      `json:"error_message,omitempty"`
	CreatedAt         string      `json:"created_at"`
	CompletedAt       string      `json:"completed_at,omitempty"`
	Events            []EventInfo `json:"events,omitempty"`
}

// EventInfo 事件信息（用于前端展示）
type EventInfo struct {
	ID           uint   `json:"id"`
	EventIndex   int    `json:"event_index"`
	EventType    string `json:"event_type"`
	EventSubtype string `json:"event_subtype,omitempty"`
	RawJSON      string `json:"raw_json"`
	CreatedAt    string `json:"created_at"`
}

// TurnCompletePayload 轮次完成负载
type TurnCompletePayload struct {
	TurnID       uint    `json:"turn_id"`
	TurnIndex    int     `json:"turn_index"`
	Model        string  `json:"model,omitempty"`
	InputTokens  int     `json:"input_tokens"`
	OutputTokens int     `json:"output_tokens"`
	CostUSD      float64 `json:"cost_usd"`
	DurationMS   int64   `json:"duration_ms"`
	State        string  `json:"state"`
	ErrorMessage string  `json:"error_message,omitempty"`
}

// ErrorPayload 错误负载
type ErrorPayload struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// ModeSwitchedPayload 模式切换负载
type ModeSwitchedPayload struct {
	Mode           string `json:"mode"`            // "tui" | "headless"
	ClosedSessions int    `json:"closed_sessions"` // 关闭的会话数量
}

// PTYClosedPayload PTY 关闭负载
type PTYClosedPayload struct {
	Reason string `json:"reason"` // "mode_switch" | "container_stopped" | "manual"
}

// LoadMorePayload 加载更多请求负载
type LoadMorePayload struct {
	BeforeTurnID uint `json:"before_turn_id"`
	Limit        int  `json:"limit"`
}

// ConversationInfo 对话信息（用于 API 响应）
type ConversationInfo struct {
	ID              uint   `json:"id"`
	ContainerID     uint   `json:"container_id"`
	SessionID       string `json:"session_id"`
	ClaudeSessionID string `json:"claude_session_id,omitempty"`
	Title           string `json:"title,omitempty"`
	State           string `json:"state"`
	IsRunning       bool   `json:"is_running"`       // 后端会话是否正在运行
	TotalTurns      int    `json:"total_turns"`
	CreatedAt       string `json:"created_at"`
	UpdatedAt       string `json:"updated_at"`
}

// PromptPayload 发送 prompt 请求负载
type PromptPayload struct {
	Prompt string `json:"prompt"`
	Source string `json:"source,omitempty"` // user | strategy | monitoring
	Model  string `json:"model,omitempty"`  // Model name (e.g., claude-sonnet-4-20250514)
}

// StartPayload 创建会话请求负载
type StartPayload struct {
	WorkDir string `json:"work_dir,omitempty"`
}

// 错误代码常量
const (
	ErrorCodeInvalidRequest  = "invalid_request"
	ErrorCodeSessionNotFound = "session_not_found"
	ErrorCodeSessionBusy     = "session_busy"
	ErrorCodeProcessFailed   = "process_failed"
	ErrorCodeModeConflict    = "mode_conflict"
	ErrorCodeInternalError   = "internal_error"
)
