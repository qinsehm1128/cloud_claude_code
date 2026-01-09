package headless

import (
	"context"
	"fmt"
	"log"
	"sync"
	"time"

	"cc-platform/internal/models"
	"cc-platform/internal/monitoring"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// HeadlessManager 管理所有 Headless 会话
type HeadlessManager struct {
	db             *gorm.DB
	sessions       map[string]*HeadlessSession // sessionID -> session
	conversationSessions map[uint]string       // conversationID -> sessionID (支持多会话)
	mu             sync.RWMutex
	monitoringMgr  *monitoring.Manager
	historyManager *HeadlessHistoryManager

	// 清理配置
	idleTimeout    time.Duration // 空闲超时时间
	cleanupTicker  *time.Ticker
	cleanupDone    chan struct{}
}

// NewHeadlessManager 创建新的 HeadlessManager
func NewHeadlessManager(db *gorm.DB, monitoringMgr *monitoring.Manager) *HeadlessManager {
	hm := &HeadlessManager{
		db:                   db,
		sessions:             make(map[string]*HeadlessSession),
		conversationSessions: make(map[uint]string),
		monitoringMgr:        monitoringMgr,
		historyManager:       NewHeadlessHistoryManager(db),
		idleTimeout:          30 * time.Minute, // 默认 30 分钟空闲超时
		cleanupDone:          make(chan struct{}),
	}

	// 启动清理 goroutine
	hm.startCleanup()

	return hm
}

// startCleanup 启动定期清理
func (m *HeadlessManager) startCleanup() {
	m.cleanupTicker = time.NewTicker(5 * time.Minute)

	go func() {
		for {
			select {
			case <-m.cleanupTicker.C:
				m.cleanupIdleSessions()
			case <-m.cleanupDone:
				return
			}
		}
	}()
}

// cleanupIdleSessions 清理空闲会话
func (m *HeadlessManager) cleanupIdleSessions() {
	m.mu.Lock()
	defer m.mu.Unlock()

	now := time.Now()
	var toClose []string

	for sessionID, session := range m.sessions {
		// 只清理空闲且无客户端的会话
		if session.IsIdle() && session.GetClientCount() == 0 {
			if now.Sub(session.GetLastActive()) > m.idleTimeout {
				toClose = append(toClose, sessionID)
			}
		}
	}

	for _, sessionID := range toClose {
		log.Printf("[HeadlessManager] Cleaning up idle session: %s", sessionID)
		if session, ok := m.sessions[sessionID]; ok {
			session.Close()
			delete(m.sessions, sessionID)
			delete(m.conversationSessions, session.ConversationID)
		}
	}

	if len(toClose) > 0 {
		log.Printf("[HeadlessManager] Cleaned up %d idle sessions", len(toClose))
	}
}

// CreateSession 创建新的 Headless 会话
func (m *HeadlessManager) CreateSession(containerID uint, dockerID, workDir string) (*HeadlessSession, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	// 生成会话 ID
	sessionID := uuid.New().String()

	// 创建会话
	session := NewHeadlessSession(sessionID, containerID, dockerID, workDir, m.historyManager)

	// 创建数据库对话记录
	conversation, err := m.historyManager.CreateConversation(sessionID, containerID)
	if err != nil {
		return nil, fmt.Errorf("failed to create conversation: %w", err)
	}
	session.SetConversationID(conversation.ID)

	// 保存会话
	m.sessions[sessionID] = session
	m.conversationSessions[conversation.ID] = sessionID

	log.Printf("[HeadlessManager] Created session %s for container %d, conversation %d", sessionID, containerID, conversation.ID)

	return session, nil
}

// CreateSessionForConversation 为已有对话创建新的 Headless 会话
func (m *HeadlessManager) CreateSessionForConversation(containerID uint, dockerID, workDir string, conversationID uint) (*HeadlessSession, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	// 检查是否已有运行中的会话
	if existingSessionID, ok := m.conversationSessions[conversationID]; ok {
		if existingSession, ok := m.sessions[existingSessionID]; ok && !existingSession.IsClosed() {
			return existingSession, nil
		}
	}

	// 生成会话 ID
	sessionID := uuid.New().String()

	// 创建会话
	session := NewHeadlessSession(sessionID, containerID, dockerID, workDir, m.historyManager)
	session.SetConversationID(conversationID)

	// 更新数据库对话记录的 session_id
	if err := m.historyManager.UpdateConversationSessionID(conversationID, sessionID); err != nil {
		log.Printf("[HeadlessManager] Warning: failed to update conversation session_id: %v", err)
	}

	// 保存会话
	m.sessions[sessionID] = session
	m.conversationSessions[conversationID] = sessionID

	log.Printf("[HeadlessManager] Created session %s for existing conversation %d", sessionID, conversationID)

	return session, nil
}

// GetSession 根据 sessionID 获取会话
func (m *HeadlessManager) GetSession(sessionID string) (*HeadlessSession, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	session, ok := m.sessions[sessionID]
	return session, ok
}

// GetSessionByConversationID 根据 conversationID 获取会话
func (m *HeadlessManager) GetSessionByConversationID(conversationID uint) *HeadlessSession {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if sessionID, ok := m.conversationSessions[conversationID]; ok {
		if session, ok := m.sessions[sessionID]; ok {
			if !session.IsClosed() {
				return session
			}
		}
	}
	return nil
}

// GetSessionForContainer 获取容器的活跃会话（返回第一个找到的）
func (m *HeadlessManager) GetSessionForContainer(containerID uint) *HeadlessSession {
	m.mu.RLock()
	defer m.mu.RUnlock()

	for _, session := range m.sessions {
		if session.ContainerID == containerID && !session.IsClosed() {
			return session
		}
	}
	return nil
}

// GetAllSessionsForContainer 获取容器的所有活跃会话
func (m *HeadlessManager) GetAllSessionsForContainer(containerID uint) []*HeadlessSession {
	m.mu.RLock()
	defer m.mu.RUnlock()

	var sessions []*HeadlessSession
	for _, session := range m.sessions {
		if session.ContainerID == containerID && !session.IsClosed() {
			sessions = append(sessions, session)
		}
	}
	return sessions
}

// IsConversationRunning 检查对话是否正在运行
func (m *HeadlessManager) IsConversationRunning(conversationID uint) bool {
	session := m.GetSessionByConversationID(conversationID)
	return session != nil && !session.IsClosed()
}

// CloseSession 关闭指定会话
func (m *HeadlessManager) CloseSession(sessionID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	session, ok := m.sessions[sessionID]
	if !ok {
		return fmt.Errorf("session not found: %s", sessionID)
	}

	// 关闭会话
	if err := session.Close(); err != nil {
		log.Printf("[HeadlessManager] Error closing session %s: %v", sessionID, err)
	}

	// 从 map 中移除
	delete(m.sessions, sessionID)
	delete(m.conversationSessions, session.ConversationID)

	log.Printf("[HeadlessManager] Closed session %s", sessionID)

	return nil
}

// CloseSessionByConversationID 根据 conversationID 关闭会话
func (m *HeadlessManager) CloseSessionByConversationID(conversationID uint) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	sessionID, ok := m.conversationSessions[conversationID]
	if !ok {
		return nil // 没有运行中的会话，不是错误
	}

	session, ok := m.sessions[sessionID]
	if !ok {
		delete(m.conversationSessions, conversationID)
		return nil
	}

	// 关闭会话
	if err := session.Close(); err != nil {
		log.Printf("[HeadlessManager] Error closing session %s: %v", sessionID, err)
	}

	// 从 map 中移除
	delete(m.sessions, sessionID)
	delete(m.conversationSessions, conversationID)

	log.Printf("[HeadlessManager] Closed session %s for conversation %d", sessionID, conversationID)

	return nil
}

// CloseSessionsForContainer 关闭容器的所有会话
func (m *HeadlessManager) CloseSessionsForContainer(containerID uint) int {
	m.mu.Lock()
	defer m.mu.Unlock()

	closedCount := 0

	for sessionID, session := range m.sessions {
		if session.ContainerID == containerID {
			if err := session.Close(); err != nil {
				log.Printf("[HeadlessManager] Error closing session %s: %v", sessionID, err)
			}
			delete(m.sessions, sessionID)
			delete(m.conversationSessions, session.ConversationID)
			closedCount++
		}
	}

	log.Printf("[HeadlessManager] Closed %d sessions for container %d", closedCount, containerID)

	return closedCount
}

// SendPrompt 发送 prompt 到会话
func (m *HeadlessManager) SendPrompt(sessionID, prompt string, source string) error {
	return m.SendPromptWithModel(sessionID, prompt, source, "")
}

// SendPromptWithModel 发送 prompt 到会话（带模型参数）
func (m *HeadlessManager) SendPromptWithModel(sessionID, prompt string, source string, model string) error {
	session, ok := m.GetSession(sessionID)
	if !ok {
		return fmt.Errorf("session not found: %s", sessionID)
	}

	// 检查状态
	if session.GetState() == HeadlessStateRunning {
		return fmt.Errorf("session is busy")
	}
	if session.GetState() == HeadlessStateClosed {
		return fmt.Errorf("session is closed")
	}

	// 设置模型（如果提供）
	if model != "" {
		session.Model = model
	}

	// 创建新轮次
	if source == "" {
		source = models.HeadlessPromptSourceUser
	}
	turn, err := m.historyManager.StartTurn(session.ConversationID, prompt, source)
	if err != nil {
		return fmt.Errorf("failed to start turn: %w", err)
	}
	session.SetCurrentTurnID(turn.ID)

	// 重置响应构建器
	session.responseBuilder.Reset()

	// 启动 Claude 进程
	ctx := context.Background()
	if err := session.StartClaudeProcess(ctx, prompt); err != nil {
		// 标记轮次失败
		m.historyManager.FailTurn(turn.ID, err.Error())
		return fmt.Errorf("failed to start claude process: %w", err)
	}

	return nil
}

// CancelExecution 取消会话执行
func (m *HeadlessManager) CancelExecution(sessionID string) error {
	session, ok := m.GetSession(sessionID)
	if !ok {
		return fmt.Errorf("session not found: %s", sessionID)
	}

	return session.CancelExecution()
}

// GetHistoryManager 获取历史管理器
func (m *HeadlessManager) GetHistoryManager() *HeadlessHistoryManager {
	return m.historyManager
}

// GetAllSessions 获取所有会话（用于调试）
func (m *HeadlessManager) GetAllSessions() []*HeadlessSession {
	m.mu.RLock()
	defer m.mu.RUnlock()

	sessions := make([]*HeadlessSession, 0, len(m.sessions))
	for _, session := range m.sessions {
		sessions = append(sessions, session)
	}

	return sessions
}

// GetSessionCount 获取会话数量
func (m *HeadlessManager) GetSessionCount() int {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return len(m.sessions)
}

// Close 关闭管理器
func (m *HeadlessManager) Close() error {
	log.Printf("[HeadlessManager] Closing manager")

	// 停止清理 goroutine
	if m.cleanupTicker != nil {
		m.cleanupTicker.Stop()
	}
	close(m.cleanupDone)

	// 关闭所有会话
	m.mu.Lock()
	defer m.mu.Unlock()

	for sessionID, session := range m.sessions {
		if err := session.Close(); err != nil {
			log.Printf("[HeadlessManager] Error closing session %s: %v", sessionID, err)
		}
	}

	m.sessions = make(map[string]*HeadlessSession)
	m.conversationSessions = make(map[uint]string)

	log.Printf("[HeadlessManager] Manager closed")

	return nil
}

// SetIdleTimeout 设置空闲超时时间
func (m *HeadlessManager) SetIdleTimeout(timeout time.Duration) {
	m.idleTimeout = timeout
}

// SetupMonitoringForSession 为会话设置监控
func (m *HeadlessManager) SetupMonitoringForSession(session *HeadlessSession) error {
	if m.monitoringMgr == nil {
		return nil
	}

	// 创建监控会话
	monitoringSession, err := m.monitoringMgr.GetOrCreateSessionForPTY(
		session.ContainerID,
		session.DockerID,
		"headless-"+session.ID,
		nil, // 无 PTYSession
	)
	if err != nil {
		return fmt.Errorf("failed to create monitoring session: %w", err)
	}

	// 设置写入函数（用于策略注入）
	monitoringSession.SetWriteToPTY(func(data []byte) error {
		// 将注入的命令作为新的 prompt 发送
		prompt := string(data)
		return m.SendPrompt(session.ID, prompt, models.HeadlessPromptSourceStrategy)
	})

	session.SetMonitoringSession(monitoringSession)

	log.Printf("[HeadlessManager] Monitoring setup for session %s", session.ID)

	return nil
}
