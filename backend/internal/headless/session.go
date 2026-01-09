package headless

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"os/exec"
	"strings"
	"sync"
	"time"

	"cc-platform/internal/monitoring"

	"github.com/docker/docker/api/types"
	"github.com/docker/docker/client"
)

// HeadlessSession 表示一个 Headless 模式的 Claude 会话
type HeadlessSession struct {
	ID              string // 会话唯一标识（由后端生成）
	ContainerID     uint   // 关联的容器 ID
	DockerID        string // Docker 容器 ID
	ClaudeSessionID string // Claude 返回的 session_id（用于 --resume）
	WorkDir         string // 工作目录
	ConversationID  uint   // 数据库中的对话 ID
	Model           string // 模型名称（如 claude-sonnet-4-20250514）

	// 进程管理 (exec.Command 方式，保留兼容)
	cmd    *exec.Cmd      // Claude 进程
	stdin  io.WriteCloser // 进程 stdin
	stdout io.ReadCloser  // 进程 stdout
	stderr io.ReadCloser  // 进程 stderr

	// Docker API 方式
	dockerClient  *client.Client
	execID        string
	hijackedResp  *types.HijackedResponse
	cancelRead    context.CancelFunc

	// 状态
	State     HeadlessState // running | idle | error | closed
	stateMu   sync.RWMutex  // 状态锁

	// 当前轮次
	CurrentTurnID uint // 当前轮次 ID
	turnMu        sync.RWMutex

	// 输出通道
	OutputChan chan *StreamEvent // 解析后的事件流
	DoneChan   chan struct{}     // 进程结束信号

	// 客户端管理（支持多客户端订阅）
	clients   map[string]chan *StreamEvent
	clientsMu sync.RWMutex

	// 上下文
	ctx    context.Context
	cancel context.CancelFunc

	// 监控集成
	monitoringSession *monitoring.MonitoringSession

	// 对话历史管理
	historyManager *HeadlessHistoryManager

	// 响应聚合
	responseBuilder *ResponseBuilder

	// 创建时间
	CreatedAt time.Time
	// 最后活跃时间
	LastActiveAt time.Time
	lastActiveMu sync.RWMutex
}

// ResponseBuilder 用于聚合流式响应
type ResponseBuilder struct {
	texts        []string
	model        string
	inputTokens  int
	outputTokens int
	startTime    time.Time
	mu           sync.Mutex
}

// NewResponseBuilder 创建新的响应构建器
func NewResponseBuilder() *ResponseBuilder {
	return &ResponseBuilder{
		texts:     make([]string, 0),
		startTime: time.Now(),
	}
}

// AppendText 追加文本
func (rb *ResponseBuilder) AppendText(text string) {
	rb.mu.Lock()
	defer rb.mu.Unlock()
	rb.texts = append(rb.texts, text)
}

// SetModel 设置模型
func (rb *ResponseBuilder) SetModel(model string) {
	rb.mu.Lock()
	defer rb.mu.Unlock()
	if model != "" {
		rb.model = model
	}
}

// UpdateUsage 更新 token 使用
func (rb *ResponseBuilder) UpdateUsage(usage *UsageInfo) {
	if usage == nil {
		return
	}
	rb.mu.Lock()
	defer rb.mu.Unlock()
	rb.inputTokens = usage.InputTokens
	rb.outputTokens = usage.OutputTokens
}

// Build 构建最终响应
func (rb *ResponseBuilder) Build() (response string, model string, inputTokens, outputTokens int, durationMS int64) {
	rb.mu.Lock()
	defer rb.mu.Unlock()

	var b strings.Builder
	for i, t := range rb.texts {
		if i > 0 {
			b.WriteString("\n")
		}
		b.WriteString(t)
	}
	response = b.String()
	model = rb.model
	inputTokens = rb.inputTokens
	outputTokens = rb.outputTokens
	durationMS = time.Since(rb.startTime).Milliseconds()
	return
}

// Reset 重置构建器
func (rb *ResponseBuilder) Reset() {
	rb.mu.Lock()
	defer rb.mu.Unlock()
	rb.texts = make([]string, 0)
	rb.model = ""
	rb.inputTokens = 0
	rb.outputTokens = 0
	rb.startTime = time.Now()
}

// NewHeadlessSession 创建新的 Headless 会话
func NewHeadlessSession(
	id string,
	containerID uint,
	dockerID string,
	workDir string,
	historyManager *HeadlessHistoryManager,
) *HeadlessSession {
	ctx, cancel := context.WithCancel(context.Background())

	return &HeadlessSession{
		ID:              id,
		ContainerID:     containerID,
		DockerID:        dockerID,
		WorkDir:         workDir,
		State:           HeadlessStateIdle,
		OutputChan:      make(chan *StreamEvent, 100),
		DoneChan:        make(chan struct{}),
		clients:         make(map[string]chan *StreamEvent),
		ctx:             ctx,
		cancel:          cancel,
		historyManager:  historyManager,
		responseBuilder: NewResponseBuilder(),
		CreatedAt:       time.Now(),
		LastActiveAt:    time.Now(),
	}
}

// GetState 获取会话状态
func (s *HeadlessSession) GetState() HeadlessState {
	s.stateMu.RLock()
	defer s.stateMu.RUnlock()
	return s.State
}

// SetState 设置会话状态
func (s *HeadlessSession) SetState(state HeadlessState) {
	s.stateMu.Lock()
	defer s.stateMu.Unlock()
	s.State = state
	log.Printf("[HeadlessSession %s] State changed to: %s", s.ID, state)
}

// GetCurrentTurnID 获取当前轮次 ID
func (s *HeadlessSession) GetCurrentTurnID() uint {
	s.turnMu.RLock()
	defer s.turnMu.RUnlock()
	return s.CurrentTurnID
}

// SetCurrentTurnID 设置当前轮次 ID
func (s *HeadlessSession) SetCurrentTurnID(turnID uint) {
	s.turnMu.Lock()
	defer s.turnMu.Unlock()
	s.CurrentTurnID = turnID
}

// UpdateLastActive 更新最后活跃时间
func (s *HeadlessSession) UpdateLastActive() {
	s.lastActiveMu.Lock()
	defer s.lastActiveMu.Unlock()
	s.LastActiveAt = time.Now()
}

// GetLastActive 获取最后活跃时间
func (s *HeadlessSession) GetLastActive() time.Time {
	s.lastActiveMu.RLock()
	defer s.lastActiveMu.RUnlock()
	return s.LastActiveAt
}

// AddClient 添加客户端订阅
func (s *HeadlessSession) AddClient(clientID string) chan *StreamEvent {
	s.clientsMu.Lock()
	defer s.clientsMu.Unlock()

	// 创建带缓冲的 channel
	ch := make(chan *StreamEvent, 100)
	s.clients[clientID] = ch
	log.Printf("[HeadlessSession %s] Client added: %s, total clients: %d", s.ID, clientID, len(s.clients))
	return ch
}

// RemoveClient 移除客户端订阅
func (s *HeadlessSession) RemoveClient(clientID string) {
	s.clientsMu.Lock()
	defer s.clientsMu.Unlock()

	if ch, ok := s.clients[clientID]; ok {
		close(ch)
		delete(s.clients, clientID)
		log.Printf("[HeadlessSession %s] Client removed: %s, remaining clients: %d", s.ID, clientID, len(s.clients))
	}
}

// GetClientCount 获取客户端数量
func (s *HeadlessSession) GetClientCount() int {
	s.clientsMu.RLock()
	defer s.clientsMu.RUnlock()
	return len(s.clients)
}

// broadcastToClients 广播事件到所有客户端
func (s *HeadlessSession) broadcastToClients(event *StreamEvent) {
	s.clientsMu.RLock()
	defer s.clientsMu.RUnlock()

	for clientID, ch := range s.clients {
		select {
		case ch <- event:
			// 发送成功
		default:
			// channel 已满，跳过（避免阻塞）
			log.Printf("[HeadlessSession %s] Client %s channel full, skipping event", s.ID, clientID)
		}
	}
}

// SetConversationID 设置对话 ID
func (s *HeadlessSession) SetConversationID(conversationID uint) {
	s.ConversationID = conversationID
}

// SetClaudeSessionID 设置 Claude 会话 ID
func (s *HeadlessSession) SetClaudeSessionID(claudeSessionID string) {
	s.ClaudeSessionID = claudeSessionID

	// 更新数据库
	if s.historyManager != nil && s.ConversationID > 0 {
		if err := s.historyManager.UpdateClaudeSessionID(s.ConversationID, claudeSessionID); err != nil {
			log.Printf("[HeadlessSession %s] Failed to update claude session id: %v", s.ID, err)
		}
	}
}

// SetMonitoringSession 设置监控会话
func (s *HeadlessSession) SetMonitoringSession(ms *monitoring.MonitoringSession) {
	s.monitoringSession = ms
}

// GetMonitoringSession 获取监控会话
func (s *HeadlessSession) GetMonitoringSession() *monitoring.MonitoringSession {
	return s.monitoringSession
}

// Close 关闭会话
func (s *HeadlessSession) Close() error {
	log.Printf("[HeadlessSession %s] Closing session", s.ID)

	// 取消上下文
	s.cancel()

	// 取消读取
	if s.cancelRead != nil {
		s.cancelRead()
	}

	// 关闭 Docker API 资源
	if s.hijackedResp != nil {
		s.hijackedResp.Close()
	}
	if s.dockerClient != nil {
		s.dockerClient.Close()
	}

	// 终止进程 (exec.Command 方式)
	if s.cmd != nil && s.cmd.Process != nil {
		if err := s.cmd.Process.Kill(); err != nil {
			log.Printf("[HeadlessSession %s] Failed to kill process: %v", s.ID, err)
		}
	}

	// 关闭管道
	if s.stdin != nil {
		s.stdin.Close()
	}
	if s.stdout != nil {
		s.stdout.Close()
	}
	if s.stderr != nil {
		s.stderr.Close()
	}

	// 关闭所有客户端 channel
	s.clientsMu.Lock()
	for clientID, ch := range s.clients {
		close(ch)
		delete(s.clients, clientID)
	}
	s.clientsMu.Unlock()

	// 关闭输出 channel
	select {
	case <-s.DoneChan:
		// 已关闭
	default:
		close(s.DoneChan)
	}

	// 更新状态
	s.SetState(HeadlessStateClosed)

	// 更新数据库状态
	if s.historyManager != nil && s.ConversationID > 0 {
		s.historyManager.CloseConversation(s.ConversationID)
	}

	log.Printf("[HeadlessSession %s] Session closed", s.ID)
	return nil
}

// IsRunning 检查会话是否正在运行
func (s *HeadlessSession) IsRunning() bool {
	return s.GetState() == HeadlessStateRunning
}

// IsIdle 检查会话是否空闲
func (s *HeadlessSession) IsIdle() bool {
	return s.GetState() == HeadlessStateIdle
}

// IsClosed 检查会话是否已关闭
func (s *HeadlessSession) IsClosed() bool {
	return s.GetState() == HeadlessStateClosed
}

// GetSessionInfo 获取会话信息
func (s *HeadlessSession) GetSessionInfo() *SessionInfoPayload {
	return &SessionInfoPayload{
		SessionID:       s.ID,
		ClaudeSessionID: s.ClaudeSessionID,
		State:           s.GetState(),
		ConversationID:  s.ConversationID,
		CurrentTurnID:   s.GetCurrentTurnID(),
	}
}

// OnStreamEvent 处理流式事件
func (s *HeadlessSession) OnStreamEvent(evt *StreamEvent) {
	// 更新最后活跃时间
	s.UpdateLastActive()

	// 提取 session_id（首轮）
	if s.ClaudeSessionID == "" && evt.SessionID != "" {
		s.SetClaudeSessionID(evt.SessionID)
	}

	// 更新模型和 usage
	if evt.Model != "" {
		s.responseBuilder.SetModel(evt.Model)
	}
	if usage := ExtractUsageInfo(evt); usage != nil {
		s.responseBuilder.UpdateUsage(usage)
	}

	// 只从 assistant 类型的事件中提取文本内容
	if evt.Type == StreamEventTypeAssistant {
		if text := ExtractTextContent(evt); text != "" {
			s.responseBuilder.AppendText(text)
		}
	}

	// 持久化事件
	if s.historyManager != nil && s.GetCurrentTurnID() > 0 {
		if err := s.historyManager.AppendEvent(
			s.GetCurrentTurnID(),
			evt.Type,
			evt.Subtype,
			evt.Raw,
		); err != nil {
			log.Printf("[HeadlessSession %s] Failed to append event: %v", s.ID, err)
		}
	}

	// 广播到客户端
	s.broadcastToClients(evt)

	// 触发监控回调
	if s.monitoringSession != nil {
		// 将事件序列化为文本，更新上下文缓冲区
		s.monitoringSession.OnOutput([]byte(evt.Raw))
	}
}

// OnTurnComplete 轮次完成处理
func (s *HeadlessSession) OnTurnComplete(success bool, errorMsg string) {
	turnID := s.GetCurrentTurnID()
	log.Printf("[HeadlessSession %s] OnTurnComplete called: success=%v, errorMsg=%s, turnID=%d", s.ID, success, errorMsg, turnID)
	
	if turnID == 0 {
		log.Printf("[HeadlessSession %s] OnTurnComplete: turnID is 0, skipping", s.ID)
		return
	}

	// 构建响应
	response, model, inputTokens, outputTokens, durationMS := s.responseBuilder.Build()

	// 计算费用（简化计算，实际应根据模型定价）
	costUSD := float64(inputTokens)*0.000003 + float64(outputTokens)*0.000015

	if s.historyManager != nil {
		if success {
			if err := s.historyManager.CompleteTurn(
				turnID,
				response,
				model,
				inputTokens,
				outputTokens,
				costUSD,
				durationMS,
			); err != nil {
				log.Printf("[HeadlessSession %s] Failed to complete turn: %v", s.ID, err)
			}
		} else {
			if err := s.historyManager.FailTurn(turnID, errorMsg); err != nil {
				log.Printf("[HeadlessSession %s] Failed to fail turn: %v", s.ID, err)
			}
		}
	}

	// 重置响应构建器
	s.responseBuilder.Reset()

	// 更新状态
	if success {
		s.SetState(HeadlessStateIdle)
	} else {
		s.SetState(HeadlessStateError)
	}

	// 构建轮次完成负载
	state := "completed"
	if !success {
		state = "failed"
	}
	
	completePayload := &TurnCompletePayload{
		TurnID:       turnID,
		TurnIndex:    0, // 默认值，下面会尝试从数据库获取
		Model:        model,
		InputTokens:  inputTokens,
		OutputTokens: outputTokens,
		CostUSD:      costUSD,
		DurationMS:   durationMS,
		State:        state,
		ErrorMessage: errorMsg,
	}

	// 尝试从数据库获取更多信息
	if s.historyManager != nil {
		if turn, err := s.historyManager.GetTurnByID(turnID); err == nil && turn != nil {
			completePayload.TurnIndex = turn.TurnIndex
			completePayload.State = turn.State
			completePayload.ErrorMessage = turn.ErrorMessage
		}
	}

	// 创建一个特殊的完成事件
	completeEvent := &StreamEvent{
		Type:   "turn_complete",
		IsMeta: true,
		Raw:    fmt.Sprintf(`{"type":"turn_complete","turn_id":%d}`, turnID),
	}
	if b, err := json.Marshal(completePayload); err == nil {
		completeEvent.Result = string(b)
	} else {
		completeEvent.Result = fmt.Sprintf("%+v", completePayload)
	}
	
	log.Printf("[HeadlessSession %s] Broadcasting turn_complete event: turnID=%d, state=%s", s.ID, turnID, completePayload.State)
	s.broadcastToClients(completeEvent)
	
	// 重置 CurrentTurnID，防止重复触发
	s.SetCurrentTurnID(0)
}
