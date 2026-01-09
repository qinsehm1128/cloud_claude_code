package headless

import (
	"fmt"
	"strings"
	"sync"
	"time"

	"cc-platform/internal/models"

	"gorm.io/gorm"
)

// HeadlessHistoryManager 管理对话历史的持久化和查询
type HeadlessHistoryManager struct {
	db *gorm.DB
	mu sync.Mutex
}

const maxInsertRetries = 3

func isUniqueConstraintError(err error) bool {
	if err == nil {
		return false
	}
	msg := err.Error()
	return strings.Contains(msg, "UNIQUE constraint failed") ||
		strings.Contains(strings.ToLower(msg), "duplicate") ||
		strings.Contains(strings.ToLower(msg), "unique constraint")
}

// NewHeadlessHistoryManager 创建新的历史管理器
func NewHeadlessHistoryManager(db *gorm.DB) *HeadlessHistoryManager {
	return &HeadlessHistoryManager{
		db: db,
	}
}

// CreateConversation 创建新的对话记录
func (m *HeadlessHistoryManager) CreateConversation(sessionID string, containerID uint) (*models.HeadlessConversation, error) {
	conversation := &models.HeadlessConversation{
		SessionID:   sessionID,
		ContainerID: containerID,
		State:       models.HeadlessConversationStateIdle,
	}

	if err := m.db.Create(conversation).Error; err != nil {
		return nil, fmt.Errorf("failed to create conversation: %w", err)
	}

	return conversation, nil
}

// GetConversation 根据 SessionID 获取对话
func (m *HeadlessHistoryManager) GetConversation(sessionID string) (*models.HeadlessConversation, error) {
	var conversation models.HeadlessConversation
	if err := m.db.Where("session_id = ?", sessionID).First(&conversation).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to get conversation: %w", err)
	}
	return &conversation, nil
}

// GetConversationByID 根据 ID 获取对话
func (m *HeadlessHistoryManager) GetConversationByID(id uint) (*models.HeadlessConversation, error) {
	var conversation models.HeadlessConversation
	if err := m.db.First(&conversation, id).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to get conversation by id: %w", err)
	}
	return &conversation, nil
}

// UpdateConversationState 更新对话状态
func (m *HeadlessHistoryManager) UpdateConversationState(conversationID uint, state string) error {
	if err := m.db.Model(&models.HeadlessConversation{}).
		Where("id = ?", conversationID).
		Update("state", state).Error; err != nil {
		return fmt.Errorf("failed to update conversation state: %w", err)
	}
	return nil
}

// UpdateClaudeSessionID 更新 Claude 会话 ID
func (m *HeadlessHistoryManager) UpdateClaudeSessionID(conversationID uint, claudeSessionID string) error {
	if err := m.db.Model(&models.HeadlessConversation{}).
		Where("id = ?", conversationID).
		Update("claude_session_id", claudeSessionID).Error; err != nil {
		return fmt.Errorf("failed to update claude session id: %w", err)
	}
	return nil
}

// UpdateConversationSessionID 更新对话的 session_id（用于恢复会话）
func (m *HeadlessHistoryManager) UpdateConversationSessionID(conversationID uint, sessionID string) error {
	if err := m.db.Model(&models.HeadlessConversation{}).
		Where("id = ?", conversationID).
		Update("session_id", sessionID).Error; err != nil {
		return fmt.Errorf("failed to update conversation session_id: %w", err)
	}
	return nil
}

// StartTurn 开始新的轮次
func (m *HeadlessHistoryManager) StartTurn(conversationID uint, prompt string, source string) (*models.HeadlessTurn, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	var lastErr error

	for attempt := 0; attempt < maxInsertRetries; attempt++ {
		var turn *models.HeadlessTurn

		err := m.db.Transaction(func(tx *gorm.DB) error {
			// 获取当前最大的 TurnIndex（在事务中）
			var maxIndex int
			tx.Model(&models.HeadlessTurn{}).
				Where("conversation_id = ?", conversationID).
				Select("COALESCE(MAX(turn_index), -1)").
				Scan(&maxIndex)

			turn = &models.HeadlessTurn{
				ConversationID: conversationID,
				TurnIndex:      maxIndex + 1,
				UserPrompt:     prompt,
				PromptSource:   source,
				State:          models.HeadlessTurnStateRunning,
			}

			if err := tx.Create(turn).Error; err != nil {
				return fmt.Errorf("failed to create turn: %w", err)
			}

			// 更新对话状态为 running
			if err := tx.Model(&models.HeadlessConversation{}).
				Where("id = ?", conversationID).
				Update("state", models.HeadlessConversationStateRunning).Error; err != nil {
				return fmt.Errorf("failed to update conversation state: %w", err)
			}

			return nil
		})

		if err == nil {
			return turn, nil
		}
		lastErr = err
		if !isUniqueConstraintError(err) {
			return nil, err
		}
	}

	return nil, fmt.Errorf("failed to create turn after retries: %w", lastErr)
}

// AppendEvent 追加事件到轮次
func (m *HeadlessHistoryManager) AppendEvent(turnID uint, eventType, eventSubtype, rawJSON string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	var lastErr error
	for attempt := 0; attempt < maxInsertRetries; attempt++ {
		err := m.db.Transaction(func(tx *gorm.DB) error {
			// 获取当前最大的 EventIndex（在事务中）
			var maxIndex int
			tx.Model(&models.HeadlessEvent{}).
				Where("turn_id = ?", turnID).
				Select("COALESCE(MAX(event_index), -1)").
				Scan(&maxIndex)

			event := &models.HeadlessEvent{
				TurnID:       turnID,
				EventIndex:   maxIndex + 1,
				EventType:    eventType,
				EventSubtype: eventSubtype,
				RawJSON:      rawJSON,
			}

			if err := tx.Create(event).Error; err != nil {
				return fmt.Errorf("failed to append event: %w", err)
			}

			return nil
		})
		if err == nil {
			return nil
		}
		lastErr = err
		if !isUniqueConstraintError(err) {
			return err
		}
	}

	return fmt.Errorf("failed to append event after retries: %w", lastErr)
}

// CompleteTurn 完成轮次
func (m *HeadlessHistoryManager) CompleteTurn(turnID uint, assistantResponse string, model string, inputTokens, outputTokens int, costUSD float64, durationMS int64) error {
	now := time.Now()
	updates := map[string]interface{}{
		"state":              models.HeadlessTurnStateCompleted,
		"assistant_response": assistantResponse,
		"model":              model,
		"input_tokens":       inputTokens,
		"output_tokens":      outputTokens,
		"cost_usd":           costUSD,
		"duration_ms":        durationMS,
		"completed_at":       &now,
	}

	if err := m.db.Model(&models.HeadlessTurn{}).
		Where("id = ?", turnID).
		Updates(updates).Error; err != nil {
		return fmt.Errorf("failed to complete turn: %w", err)
	}

	// 获取轮次对应的对话 ID，更新对话状态为 idle
	var turn models.HeadlessTurn
	if err := m.db.First(&turn, turnID).Error; err == nil {
		m.UpdateConversationState(turn.ConversationID, models.HeadlessConversationStateIdle)
	}

	return nil
}

// FailTurn 标记轮次失败
func (m *HeadlessHistoryManager) FailTurn(turnID uint, errorMessage string) error {
	now := time.Now()
	updates := map[string]interface{}{
		"state":         models.HeadlessTurnStateError,
		"error_message": errorMessage,
		"completed_at":  &now,
	}

	if err := m.db.Model(&models.HeadlessTurn{}).
		Where("id = ?", turnID).
		Updates(updates).Error; err != nil {
		return fmt.Errorf("failed to fail turn: %w", err)
	}

	// 获取轮次对应的对话 ID，更新对话状态为 error
	var turn models.HeadlessTurn
	if err := m.db.First(&turn, turnID).Error; err == nil {
		m.UpdateConversationState(turn.ConversationID, models.HeadlessConversationStateError)
	}

	return nil
}

// GetRecentTurns 获取最近 N 轮对话（用于初始加载）
// 返回：轮次列表（按 TurnIndex 降序）、是否还有更多、错误
func (m *HeadlessHistoryManager) GetRecentTurns(conversationID uint, limit int) ([]models.HeadlessTurn, bool, error) {
	var turns []models.HeadlessTurn

	// 查询 limit + 1 条记录，用于判断是否还有更多
	if err := m.db.Where("conversation_id = ?", conversationID).
		Order("turn_index DESC").
		Limit(limit + 1).
		Find(&turns).Error; err != nil {
		return nil, false, fmt.Errorf("failed to get recent turns: %w", err)
	}

	hasMore := len(turns) > limit
	if hasMore {
		turns = turns[:limit]
	}

	// 反转顺序，使其按 TurnIndex 升序排列（便于前端渲染）
	for i, j := 0, len(turns)-1; i < j; i, j = i+1, j-1 {
		turns[i], turns[j] = turns[j], turns[i]
	}

	return turns, hasMore, nil
}

// GetTurnsBefore 获取指定轮次之前的 N 轮对话（用于懒加载更早的历史）
// 返回：轮次列表（按 TurnIndex 降序）、是否还有更多、错误
func (m *HeadlessHistoryManager) GetTurnsBefore(conversationID uint, beforeTurnID uint, limit int) ([]models.HeadlessTurn, bool, error) {
	// 先获取 beforeTurnID 对应的 TurnIndex
	var beforeTurn models.HeadlessTurn
	if err := m.db.First(&beforeTurn, beforeTurnID).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, false, fmt.Errorf("turn not found: %d", beforeTurnID)
		}
		return nil, false, fmt.Errorf("failed to get before turn: %w", err)
	}

	var turns []models.HeadlessTurn

	// 查询 TurnIndex 小于 beforeTurn.TurnIndex 的记录
	if err := m.db.Where("conversation_id = ? AND turn_index < ?", conversationID, beforeTurn.TurnIndex).
		Order("turn_index DESC").
		Limit(limit + 1).
		Find(&turns).Error; err != nil {
		return nil, false, fmt.Errorf("failed to get turns before: %w", err)
	}

	hasMore := len(turns) > limit
	if hasMore {
		turns = turns[:limit]
	}

	// 反转顺序，使其按 TurnIndex 升序排列
	for i, j := 0, len(turns)-1; i < j; i, j = i+1, j-1 {
		turns[i], turns[j] = turns[j], turns[i]
	}

	return turns, hasMore, nil
}

// GetTurnEvents 获取指定轮次的所有事件
func (m *HeadlessHistoryManager) GetTurnEvents(turnID uint) ([]models.HeadlessEvent, error) {
	var events []models.HeadlessEvent

	if err := m.db.Where("turn_id = ?", turnID).
		Order("event_index ASC").
		Find(&events).Error; err != nil {
		return nil, fmt.Errorf("failed to get turn events: %w", err)
	}

	return events, nil
}

// GetCurrentTurnEvents 获取当前轮次已有的事件（用于重连时补发）
func (m *HeadlessHistoryManager) GetCurrentTurnEvents(turnID uint) ([]models.HeadlessEvent, error) {
	return m.GetTurnEvents(turnID)
}

// GetTurnByID 根据 ID 获取轮次
func (m *HeadlessHistoryManager) GetTurnByID(turnID uint) (*models.HeadlessTurn, error) {
	var turn models.HeadlessTurn
	if err := m.db.First(&turn, turnID).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to get turn by id: %w", err)
	}
	return &turn, nil
}

// GetLatestTurn 获取对话的最新轮次
func (m *HeadlessHistoryManager) GetLatestTurn(conversationID uint) (*models.HeadlessTurn, error) {
	var turn models.HeadlessTurn
	if err := m.db.Where("conversation_id = ?", conversationID).
		Order("turn_index DESC").
		First(&turn).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to get latest turn: %w", err)
	}
	return &turn, nil
}

// GetConversationForContainer 获取容器的活跃对话
func (m *HeadlessHistoryManager) GetConversationForContainer(containerID uint) (*models.HeadlessConversation, error) {
	var conversation models.HeadlessConversation
	// 查找非 closed 状态的对话
	if err := m.db.Where("container_id = ? AND state != ?", containerID, models.HeadlessConversationStateClosed).
		Order("created_at DESC").
		First(&conversation).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to get conversation for container: %w", err)
	}
	return &conversation, nil
}

// CloseConversation 关闭对话
func (m *HeadlessHistoryManager) CloseConversation(conversationID uint) error {
	return m.UpdateConversationState(conversationID, models.HeadlessConversationStateClosed)
}

// UpdateTurnAssistantResponse 更新轮次的助手响应（用于流式聚合）
func (m *HeadlessHistoryManager) UpdateTurnAssistantResponse(turnID uint, response string) error {
	if err := m.db.Model(&models.HeadlessTurn{}).
		Where("id = ?", turnID).
		Update("assistant_response", response).Error; err != nil {
		return fmt.Errorf("failed to update assistant response: %w", err)
	}
	return nil
}

// ListConversationsForContainer 获取容器的所有对话列表
func (m *HeadlessHistoryManager) ListConversationsForContainer(containerID uint) ([]models.HeadlessConversation, error) {
	var conversations []models.HeadlessConversation
	if err := m.db.Where("container_id = ?", containerID).
		Order("updated_at DESC").
		Find(&conversations).Error; err != nil {
		return nil, fmt.Errorf("failed to list conversations: %w", err)
	}
	return conversations, nil
}

// DeleteConversation 删除对话及其所有轮次和事件
func (m *HeadlessHistoryManager) DeleteConversation(conversationID uint) error {
	return m.db.Transaction(func(tx *gorm.DB) error {
		// 获取所有轮次 ID
		var turnIDs []uint
		if err := tx.Model(&models.HeadlessTurn{}).
			Where("conversation_id = ?", conversationID).
			Pluck("id", &turnIDs).Error; err != nil {
			return fmt.Errorf("failed to get turn ids: %w", err)
		}

		// 删除所有事件
		if len(turnIDs) > 0 {
			if err := tx.Where("turn_id IN ?", turnIDs).Delete(&models.HeadlessEvent{}).Error; err != nil {
				return fmt.Errorf("failed to delete events: %w", err)
			}
		}

		// 删除所有轮次
		if err := tx.Where("conversation_id = ?", conversationID).Delete(&models.HeadlessTurn{}).Error; err != nil {
			return fmt.Errorf("failed to delete turns: %w", err)
		}

		// 删除对话
		if err := tx.Delete(&models.HeadlessConversation{}, conversationID).Error; err != nil {
			return fmt.Errorf("failed to delete conversation: %w", err)
		}

		return nil
	})
}

// UpdateConversationTitle 更新对话标题
func (m *HeadlessHistoryManager) UpdateConversationTitle(conversationID uint, title string) error {
	if err := m.db.Model(&models.HeadlessConversation{}).
		Where("id = ?", conversationID).
		Update("title", title).Error; err != nil {
		return fmt.Errorf("failed to update conversation title: %w", err)
	}
	return nil
}
