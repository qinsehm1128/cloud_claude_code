package models

import (
	"time"

	"gorm.io/gorm"
)

// ==================== Headless Card Mode Models ====================

// HeadlessConversation 表示一个完整的 Headless 对话
type HeadlessConversation struct {
	gorm.Model
	SessionID       string         `gorm:"index;not null" json:"session_id"`         // HeadlessSession.ID
	ContainerID     uint           `gorm:"index;not null" json:"container_id"`       // 关联的容器 ID
	ClaudeSessionID string         `gorm:"index" json:"claude_session_id,omitempty"` // Claude 返回的 session_id（用于 --resume）
	State           string         `gorm:"default:'idle'" json:"state"`              // running | idle | error | closed
	Turns           []HeadlessTurn `gorm:"foreignKey:ConversationID" json:"turns,omitempty"`
}

// HeadlessTurn 表示一轮对话（用户输入 + Claude 响应）
type HeadlessTurn struct {
	gorm.Model
	ConversationID uint `gorm:"uniqueIndex:uniq_conv_turn,priority:1;not null" json:"conversation_id"`
	TurnIndex      int  `gorm:"uniqueIndex:uniq_conv_turn,priority:2;not null" json:"turn_index"` // 轮次序号（0, 1, 2...）

	// 用户输入
	UserPrompt   string `gorm:"type:text" json:"user_prompt"`
	PromptSource string `gorm:"default:'user'" json:"prompt_source"` // user | strategy | monitoring

	// Claude 响应（聚合后的完整响应）
	AssistantResponse string `gorm:"type:text" json:"assistant_response,omitempty"`

	// 元数据
	ModelName    string  `gorm:"column:model" json:"model,omitempty"`
	InputTokens  int     `json:"input_tokens"`
	OutputTokens int     `json:"output_tokens"`
	CostUSD      float64 `json:"cost_usd"`
	DurationMS   int64   `json:"duration_ms"`

	// 状态
	State        string     `gorm:"default:'pending'" json:"state"` // pending | running | completed | error
	ErrorMessage string     `gorm:"type:text" json:"error_message,omitempty"`
	CompletedAt  *time.Time `json:"completed_at,omitempty"`

	// 关联的原始事件（用于详细查看）
	Events []HeadlessEvent `gorm:"foreignKey:TurnID" json:"events,omitempty"`
}

// HeadlessEvent 表示单个 StreamEvent（原始事件存储）
type HeadlessEvent struct {
	gorm.Model
	TurnID     uint `gorm:"index;uniqueIndex:uniq_turn_event,priority:1;not null" json:"turn_id"`
	EventIndex int  `gorm:"uniqueIndex:uniq_turn_event,priority:2;not null" json:"event_index"` // 事件序号

	// 事件内容
	EventType    string `gorm:"not null" json:"event_type"`         // system | assistant | user | result
	EventSubtype string `json:"event_subtype,omitempty"`            // 子类型
	RawJSON      string `gorm:"type:text;not null" json:"raw_json"` // 原始 JSON
}

// HeadlessConversation 状态常量
const (
	HeadlessConversationStateRunning = "running"
	HeadlessConversationStateIdle    = "idle"
	HeadlessConversationStateError   = "error"
	HeadlessConversationStateClosed  = "closed"
)

// HeadlessTurn 状态常量
const (
	HeadlessTurnStatePending   = "pending"
	HeadlessTurnStateRunning   = "running"
	HeadlessTurnStateCompleted = "completed"
	HeadlessTurnStateError     = "error"
)

// HeadlessTurn Prompt 来源常量
const (
	HeadlessPromptSourceUser       = "user"
	HeadlessPromptSourceStrategy   = "strategy"
	HeadlessPromptSourceMonitoring = "monitoring"
)

// HeadlessEvent 类型常量
const (
	HeadlessEventTypeSystem    = "system"
	HeadlessEventTypeAssistant = "assistant"
	HeadlessEventTypeUser      = "user"
	HeadlessEventTypeResult    = "result"
)

// TableName 指定 HeadlessConversation 表名
func (HeadlessConversation) TableName() string {
	return "headless_conversations"
}

// TableName 指定 HeadlessTurn 表名
func (HeadlessTurn) TableName() string {
	return "headless_turns"
}

// TableName 指定 HeadlessEvent 表名
func (HeadlessEvent) TableName() string {
	return "headless_events"
}
