package handlers

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"sync"
	"time"

	"cc-platform/internal/headless"
	"cc-platform/internal/middleware"
	"cc-platform/internal/mode"
	"cc-platform/internal/models"
	"cc-platform/internal/services"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

const (
	headlessWriteWait      = 10 * time.Second
	headlessPongWait       = 60 * time.Second
	headlessPingPeriod     = (headlessPongWait * 9) / 10
	headlessMaxMessage     = 16 * 1024
	defaultHistoryLimit    = 10 // 默认加载历史轮次数量
	defaultHistoryLimitOld = 3  // 旧版 container 模式默认加载数量
)

// HeadlessHandler 处理 Headless WebSocket 端点
type HeadlessHandler struct {
	headlessManager  *headless.HeadlessManager
	modeManager      *mode.ModeManager
	containerService *services.ContainerService
	authService      *services.AuthService
}

// NewHeadlessHandler 创建新的 HeadlessHandler
func NewHeadlessHandler(
	headlessManager *headless.HeadlessManager,
	modeManager *mode.ModeManager,
	containerService *services.ContainerService,
	authService *services.AuthService,
) *HeadlessHandler {
	return &HeadlessHandler{
		headlessManager:  headlessManager,
		modeManager:      modeManager,
		containerService: containerService,
		authService:      authService,
	}
}

// HandleHeadlessWebSocket 处理 Headless WebSocket 连接
func (h *HeadlessHandler) HandleHeadlessWebSocket(c *gin.Context) {
	// 获取容器 ID
	containerIDStr := c.Param("containerId")
	containerID, err := strconv.ParseUint(containerIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid container ID"})
		return
	}

	// 获取容器信息
	container, err := h.containerService.GetContainer(uint(containerID))
	if err != nil {
		if err == services.ErrContainerNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "Container not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get container"})
		return
	}

	if container.Status != models.ContainerStatusRunning {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Container is not running"})
		return
	}

	// 认证
	clientIP := c.ClientIP()
	isInternalRequest := isDockerInternalIP(clientIP)

	if !isInternalRequest {
		var token string
		if cookieToken, err := c.Cookie(middleware.TokenCookieName); err == nil && cookieToken != "" {
			token = cookieToken
		}
		if token == "" {
			token = c.Query("token")
		}
		if token == "" {
			log.Printf("[HeadlessHandler] Missing auth token from %s (origin: %s)", c.ClientIP(), c.GetHeader("Origin"))
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Missing authentication token"})
			return
		}
		_, err = h.authService.VerifyToken(token)
		if err != nil {
			log.Printf("[HeadlessHandler] Invalid auth token from %s (origin: %s): %v", c.ClientIP(), c.GetHeader("Origin"), err)
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid authentication token"})
			return
		}
	}

	// 升级 WebSocket
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("[HeadlessHandler] Failed to upgrade connection from %s (origin: %s): %v", c.ClientIP(), c.GetHeader("Origin"), err)
		return
	}
	defer conn.Close()

	// 配置 WebSocket 读写超时
	conn.SetReadLimit(headlessMaxMessage)
	conn.SetReadDeadline(time.Now().Add(headlessPongWait))
	conn.SetPongHandler(func(string) error {
		conn.SetReadDeadline(time.Now().Add(headlessPongWait))
		return nil
	})

	// 生成客户端 ID
	clientID := uuid.New().String()

	log.Printf("[HeadlessHandler] Client %s connected for container %d", clientID, containerID)

	// 创建客户端处理器
	client := &headlessClient{
		handler:     h,
		conn:        conn,
		clientID:    clientID,
		containerID: uint(containerID),
		dockerID:    container.DockerID,
		workDir:     container.WorkDir,
		sendChan:    make(chan *headless.HeadlessResponse, 100),
		done:        make(chan struct{}),
	}

	// 启动发送 goroutine
	go client.writePump()

	// 处理连接
	client.handleConnection()
}

// headlessClient 表示一个 Headless WebSocket 客户端
type headlessClient struct {
	handler     *HeadlessHandler
	conn        *websocket.Conn
	clientID    string
	containerID uint
	dockerID    string
	workDir     string
	sendChan    chan *headless.HeadlessResponse
	done        chan struct{}
	session     *headless.HeadlessSession
	eventChan   chan *headless.StreamEvent
	mu          sync.Mutex
}

// handleConnection 处理 WebSocket 连接
func (c *headlessClient) handleConnection() {
	defer func() {
		close(c.done)
		c.cleanup()
	}()

	// 检查是否有活跃会话
	session := c.handler.headlessManager.GetSessionForContainer(c.containerID)

	if session != nil {
		c.session = session

		// 如果会话正在运行，先订阅以避免丢事件
		if session.IsRunning() {
			c.subscribeToSession(session)
		}

		// 发送会话信息
		c.sendResponse(headless.HeadlessResponseTypeSessionInfo, session.GetSessionInfo())

		// 加载并发送历史对话
		c.sendHistory(session)
	} else {
		// 无活跃会话
		c.sendResponse(headless.HeadlessResponseTypeNoSession, nil)
	}

	// 处理客户端消息
	c.readPump()
}

// sendHistory 发送历史对话
func (c *headlessClient) sendHistory(session *headless.HeadlessSession) {
	historyManager := c.handler.headlessManager.GetHistoryManager()
	if historyManager == nil {
		return
	}

	// 获取最近轮次对话
	turns, hasMore, err := historyManager.GetRecentTurns(session.ConversationID, defaultHistoryLimitOld)
	if err != nil {
		log.Printf("[HeadlessHandler] Failed to get recent turns: %v", err)
		return
	}

	// 转换为 TurnInfo
	turnInfos := make([]headless.TurnInfo, len(turns))
	for i, turn := range turns {
		turnInfos[i] = convertTurnToInfo(&turn)
	}

	c.sendResponse(headless.HeadlessResponseTypeHistory, &headless.HistoryPayload{
		Turns:   turnInfos,
		HasMore: hasMore,
	})

	// 如果会话正在运行，发送当前轮次的已有事件
	if session.IsRunning() && session.GetCurrentTurnID() > 0 {
		events, err := historyManager.GetCurrentTurnEvents(session.GetCurrentTurnID())
		if err != nil {
			log.Printf("[HeadlessHandler] Failed to get current turn events: %v", err)
			return
		}

		for _, event := range events {
			// 解析原始 JSON 为 StreamEvent
			var evt headless.StreamEvent
			if err := json.Unmarshal([]byte(event.RawJSON), &evt); err == nil {
				c.sendResponse(headless.HeadlessResponseTypeEvent, &evt)
				continue
			}

			// fallback：处理非 JSON 行（stderr/纯文本）
			if fallbackEvt, _ := headless.ParseStreamLine(event.RawJSON); fallbackEvt != nil {
				c.sendResponse(headless.HeadlessResponseTypeEvent, fallbackEvt)
			}
		}
	}
}

// subscribeToSession 订阅会话输出
func (c *headlessClient) subscribeToSession(session *headless.HeadlessSession) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.eventChan != nil {
		return // 已订阅
	}

	c.eventChan = session.AddClient(c.clientID)

	// 使用 ready channel 确保 goroutine 已启动
	ready := make(chan struct{})

	// 启动事件转发 goroutine
	go func() {
		// 通知调用者 goroutine 已启动
		close(ready)

		for {
			select {
			case evt, ok := <-c.eventChan:
				if !ok {
					return
				}
				// 检查是否为轮次完成事件
				if evt.Type == "turn_complete" {
					// 发送轮次完成消息
					var payload headless.TurnCompletePayload
					if evt.Result != "" && json.Unmarshal([]byte(evt.Result), &payload) == nil {
						c.sendResponse(headless.HeadlessResponseTypeTurnComplete, &payload)
					} else {
						c.sendResponse(headless.HeadlessResponseTypeTurnComplete, evt.Result)
					}
				} else {
					c.sendResponse(headless.HeadlessResponseTypeEvent, evt)
				}
			case <-c.done:
				return
			}
		}
	}()

	// 等待 goroutine 启动完成
	<-ready
}

// unsubscribeFromSession 取消订阅会话输出
func (c *headlessClient) unsubscribeFromSession() {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.session != nil && c.eventChan != nil {
		c.session.RemoveClient(c.clientID)
		c.eventChan = nil
	}
}

// cleanup 清理资源
func (c *headlessClient) cleanup() {
	c.unsubscribeFromSession()
	close(c.sendChan)
	log.Printf("[HeadlessHandler] Client %s disconnected", c.clientID)
}

// readPump 读取客户端消息
func (c *headlessClient) readPump() {
	for {
		_, message, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("[HeadlessHandler] Client %s read error: %v", c.clientID, err)
			} else {
				log.Printf("[HeadlessHandler] Client %s closed: %v", c.clientID, err)
			}
			return
		}

		// 解析消息
		var req headless.HeadlessRequest
		if err := json.Unmarshal(message, &req); err != nil {
			c.sendError(headless.ErrorCodeInvalidRequest, "Invalid request format")
			continue
		}

		// 收到任意消息都延长读超时，避免依赖 pong
		c.conn.SetReadDeadline(time.Now().Add(headlessPongWait))

		// 处理消息
		c.handleMessage(&req)
	}
}

// writePump 发送消息到客户端
func (c *headlessClient) writePump() {
	ticker := time.NewTicker(headlessPingPeriod)
	defer ticker.Stop()

	for {
		select {
		case resp, ok := <-c.sendChan:
			if !ok {
				return
			}
			c.conn.SetWriteDeadline(time.Now().Add(headlessWriteWait))
			if err := c.conn.WriteJSON(resp); err != nil {
				log.Printf("[HeadlessHandler] Client %s write error: %v", c.clientID, err)
				return
			}
		case <-ticker.C:
			// 发送 ping
			c.conn.SetWriteDeadline(time.Now().Add(headlessWriteWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		case <-c.done:
			return
		}
	}
}

// handleMessage 处理客户端消息
func (c *headlessClient) handleMessage(req *headless.HeadlessRequest) {
	switch req.Type {
	case headless.HeadlessRequestTypeStart:
		c.handleStart(req)
	case headless.HeadlessRequestTypePrompt:
		c.handlePrompt(req)
	case headless.HeadlessRequestTypeCancel:
		c.handleCancel(req)
	case headless.HeadlessRequestTypeLoadMore:
		c.handleLoadMore(req)
	case headless.HeadlessRequestTypeModeSwitch:
		c.handleModeSwitch(req)
	case headless.HeadlessRequestTypePing:
		// respond to keep proxy read timeout alive
		c.sendResponse(headless.HeadlessResponseTypePong, nil)
		return
	default:
		c.sendError(headless.ErrorCodeInvalidRequest, "Unknown request type")
	}
}

// handleStart 处理创建会话请求
func (c *headlessClient) handleStart(req *headless.HeadlessRequest) {
	// 检查是否已有会话
	if c.session != nil && !c.session.IsClosed() {
		c.sendError(headless.ErrorCodeSessionBusy, "Session already exists")
		return
	}

	// 切换到 Headless 模式
	closedCount, err := c.handler.modeManager.SwitchToHeadless(c.containerID, c.dockerID)
	if err != nil {
		c.sendError(headless.ErrorCodeModeConflict, err.Error())
		return
	}

	if closedCount > 0 {
		c.sendResponse(headless.HeadlessResponseTypeModeSwitched, &headless.ModeSwitchedPayload{
			Mode:           string(mode.ModeHeadless),
			ClosedSessions: closedCount,
		})
	}

	c.killClaudeProcesses()

	// 创建会话
	workDir := c.workDir
	if payload, ok := req.Payload["work_dir"].(string); ok && payload != "" {
		workDir = payload
	}

	session, err := c.handler.headlessManager.CreateSession(c.containerID, c.dockerID, workDir)
	if err != nil {
		c.sendError(headless.ErrorCodeInternalError, err.Error())
		return
	}

	// 设置监控
	if err := c.handler.headlessManager.SetupMonitoringForSession(session); err != nil {
		log.Printf("[HeadlessHandler] Failed to setup monitoring: %v", err)
	}

	c.session = session

	// 发送会话信息
	c.sendResponse(headless.HeadlessResponseTypeSessionInfo, session.GetSessionInfo())

	// 订阅会话输出
	c.subscribeToSession(session)
}

// handlePrompt 处理发送 prompt 请求
func (c *headlessClient) handlePrompt(req *headless.HeadlessRequest) {
	if c.session == nil {
		c.sendError(headless.ErrorCodeSessionNotFound, "No active session")
		return
	}

	prompt, ok := req.Payload["prompt"].(string)
	if !ok || prompt == "" {
		c.sendError(headless.ErrorCodeInvalidRequest, "Missing prompt")
		return
	}

	source := models.HeadlessPromptSourceUser
	if s, ok := req.Payload["source"].(string); ok && s != "" {
		source = s
	}

	// 获取 model 参数（可选）
	model := ""
	if m, ok := req.Payload["model"].(string); ok && m != "" {
		model = m
	}

	// 确保已订阅（必须在 SendPrompt 之前完成）
	c.subscribeToSession(c.session)

	// 等待订阅 goroutine 启动完成
	// 这是一个简单的同步机制，确保事件监听已经就绪
	time.Sleep(10 * time.Millisecond)

	// 发送 prompt（带 model 参数）
	if err := c.handler.headlessManager.SendPromptWithModel(c.session.ID, prompt, source, model); err != nil {
		c.sendError(headless.ErrorCodeProcessFailed, err.Error())
		return
	}
}

// handleCancel 处理取消执行请求
func (c *headlessClient) handleCancel(req *headless.HeadlessRequest) {
	if c.session == nil {
		c.sendError(headless.ErrorCodeSessionNotFound, "No active session")
		return
	}

	if err := c.handler.headlessManager.CancelExecution(c.session.ID); err != nil {
		c.sendError(headless.ErrorCodeInternalError, err.Error())
		return
	}
}

// handleLoadMore 处理加载更多历史请求
func (c *headlessClient) handleLoadMore(req *headless.HeadlessRequest) {
	if c.session == nil {
		c.sendError(headless.ErrorCodeSessionNotFound, "No active session")
		return
	}

	beforeTurnID, _ := req.Payload["before_turn_id"].(float64)
	limit, _ := req.Payload["limit"].(float64)
	if limit <= 0 {
		limit = 3
	}

	historyManager := c.handler.headlessManager.GetHistoryManager()
	if historyManager == nil {
		c.sendError(headless.ErrorCodeInternalError, "History manager not available")
		return
	}

	turns, hasMore, err := historyManager.GetTurnsBefore(c.session.ConversationID, uint(beforeTurnID), int(limit))
	if err != nil {
		c.sendError(headless.ErrorCodeInternalError, err.Error())
		return
	}

	// 转换为 TurnInfo
	turnInfos := make([]headless.TurnInfo, len(turns))
	for i, turn := range turns {
		turnInfos[i] = convertTurnToInfo(&turn)
	}

	c.sendResponse(headless.HeadlessResponseTypeHistoryMore, &headless.HistoryPayload{
		Turns:   turnInfos,
		HasMore: hasMore,
	})
}

// handleModeSwitch 处理模式切换请求
func (c *headlessClient) handleModeSwitch(req *headless.HeadlessRequest) {
	targetMode, ok := req.Payload["mode"].(string)
	if !ok {
		c.sendError(headless.ErrorCodeInvalidRequest, "Missing mode")
		return
	}

	var closedCount int
	var err error

	switch mode.ContainerMode(targetMode) {
	case mode.ModeTUI:
		closedCount, err = c.handler.modeManager.SwitchToTUI(c.containerID)
		if err == nil {
			c.unsubscribeFromSession()
			c.session = nil
		}
	case mode.ModeHeadless:
		closedCount, err = c.handler.modeManager.SwitchToHeadless(c.containerID, c.dockerID)
		if err == nil {
			c.killClaudeProcesses()
		}
	default:
		c.sendError(headless.ErrorCodeInvalidRequest, "Invalid mode")
		return
	}

	if err != nil {
		c.sendError(headless.ErrorCodeModeConflict, err.Error())
		return
	}

	c.sendResponse(headless.HeadlessResponseTypeModeSwitched, &headless.ModeSwitchedPayload{
		Mode:           targetMode,
		ClosedSessions: closedCount,
	})
}

// sendResponse 发送响应
func (c *headlessClient) sendResponse(respType string, payload interface{}) {
	select {
	case c.sendChan <- &headless.HeadlessResponse{
		Type:    respType,
		Payload: payload,
	}:
	default:
		log.Printf("[HeadlessHandler] Client %s send channel full", c.clientID)
	}
}

// sendError 发送错误响应
func (c *headlessClient) sendError(code, message string) {
	c.sendResponse(headless.HeadlessResponseTypeError, &headless.ErrorPayload{
		Code:    code,
		Message: message,
	})
}

func (c *headlessClient) killClaudeProcesses() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Best-effort kill: do not fail request if command not available
	cmd := []string{"sh", "-c", "pkill -f 'claude' 2>/dev/null || true"}
	if _, err := c.handler.containerService.ExecInContainer(ctx, c.containerID, cmd); err != nil {
		log.Printf("[HeadlessHandler] Failed to kill claude processes in container %d: %v", c.containerID, err)
	}
}

// convertTurnToInfo 转换 HeadlessTurn 为 TurnInfo
func convertTurnToInfo(turn *models.HeadlessTurn) headless.TurnInfo {
	info := headless.TurnInfo{
		ID:                turn.ID,
		TurnIndex:         turn.TurnIndex,
		UserPrompt:        turn.UserPrompt,
		PromptSource:      turn.PromptSource,
		AssistantResponse: turn.AssistantResponse,
		Model:             turn.ModelName,
		InputTokens:       turn.InputTokens,
		OutputTokens:      turn.OutputTokens,
		CostUSD:           turn.CostUSD,
		DurationMS:        turn.DurationMS,
		State:             turn.State,
		ErrorMessage:      turn.ErrorMessage,
		CreatedAt:         turn.CreatedAt.Format(time.RFC3339),
	}

	if turn.CompletedAt != nil {
		info.CompletedAt = turn.CompletedAt.Format(time.RFC3339)
	}

	return info
}

// ==================== HTTP API Handlers ====================

// ListConversations 列出容器的所有对话
func (h *HeadlessHandler) ListConversations(c *gin.Context) {
	containerIDStr := c.Param("id")
	containerID, err := strconv.ParseUint(containerIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid container ID"})
		return
	}

	historyManager := h.headlessManager.GetHistoryManager()
	if historyManager == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "History manager not available"})
		return
	}

	conversations, err := historyManager.ListConversationsForContainer(uint(containerID))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// 转换为 API 响应格式
	result := make([]headless.ConversationInfo, len(conversations))
	for i, conv := range conversations {
		// 获取对话的轮次数量
		turnCount := 0
		if turns, _, err := historyManager.GetRecentTurns(conv.ID, 1000); err == nil {
			turnCount = len(turns)
		}

		// 生成标题（使用第一轮的 user_prompt 或默认标题）
		title := ""
		if turns, _, err := historyManager.GetRecentTurns(conv.ID, 1); err == nil && len(turns) > 0 {
			prompt := turns[0].UserPrompt
			if len(prompt) > 50 {
				title = prompt[:50] + "..."
			} else {
				title = prompt
			}
		}

		// 检查对话是否正在运行
		isRunning := h.headlessManager.IsConversationRunning(conv.ID)

		result[i] = headless.ConversationInfo{
			ID:              conv.ID,
			ContainerID:     conv.ContainerID,
			SessionID:       conv.SessionID,
			ClaudeSessionID: conv.ClaudeSessionID,
			Title:           title,
			State:           conv.State,
			IsRunning:       isRunning,
			TotalTurns:      turnCount,
			CreatedAt:       conv.CreatedAt.Format(time.RFC3339),
			UpdatedAt:       conv.UpdatedAt.Format(time.RFC3339),
		}
	}

	c.JSON(http.StatusOK, result)
}

// GetConversationStatus 获取对话运行状态
func (h *HeadlessHandler) GetConversationStatus(c *gin.Context) {
	conversationIDStr := c.Param("conversationId")
	conversationID, err := strconv.ParseUint(conversationIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid conversation ID"})
		return
	}

	isRunning := h.headlessManager.IsConversationRunning(uint(conversationID))
	
	c.JSON(http.StatusOK, gin.H{
		"conversation_id": conversationID,
		"is_running":      isRunning,
	})
}

// HandleConversationWebSocket 处理基于 conversationId 的 WebSocket 连接
func (h *HeadlessHandler) HandleConversationWebSocket(c *gin.Context) {
	// 获取 conversation ID
	conversationIDStr := c.Param("conversationId")
	conversationID, err := strconv.ParseUint(conversationIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid conversation ID"})
		return
	}

	// 获取对话信息
	historyManager := h.headlessManager.GetHistoryManager()
	if historyManager == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "History manager not available"})
		return
	}

	conversation, err := historyManager.GetConversationByID(uint(conversationID))
	if err != nil || conversation == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Conversation not found"})
		return
	}

	// 获取容器信息
	container, err := h.containerService.GetContainer(conversation.ContainerID)
	if err != nil {
		if err == services.ErrContainerNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "Container not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get container"})
		return
	}

	if container.Status != models.ContainerStatusRunning {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Container is not running"})
		return
	}

	// 认证
	clientIP := c.ClientIP()
	isInternalRequest := isDockerInternalIP(clientIP)

	if !isInternalRequest {
		var token string
		if cookieToken, err := c.Cookie(middleware.TokenCookieName); err == nil && cookieToken != "" {
			token = cookieToken
		}
		if token == "" {
			token = c.Query("token")
		}
		if token == "" {
			log.Printf("[HeadlessHandler] Missing auth token from %s (origin: %s)", c.ClientIP(), c.GetHeader("Origin"))
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Missing authentication token"})
			return
		}
		_, err = h.authService.VerifyToken(token)
		if err != nil {
			log.Printf("[HeadlessHandler] Invalid auth token from %s (origin: %s): %v", c.ClientIP(), c.GetHeader("Origin"), err)
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid authentication token"})
			return
		}
	}

	// 升级 WebSocket
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("[HeadlessHandler] Failed to upgrade connection from %s (origin: %s): %v", c.ClientIP(), c.GetHeader("Origin"), err)
		return
	}
	defer conn.Close()

	// 配置 WebSocket 读写超时
	conn.SetReadLimit(headlessMaxMessage)
	conn.SetReadDeadline(time.Now().Add(headlessPongWait))
	conn.SetPongHandler(func(string) error {
		conn.SetReadDeadline(time.Now().Add(headlessPongWait))
		return nil
	})

	// 生成客户端 ID
	clientID := uuid.New().String()

	log.Printf("[HeadlessHandler] Client %s connected for conversation %d", clientID, conversationID)

	// 创建客户端处理器
	client := &conversationClient{
		handler:        h,
		conn:           conn,
		clientID:       clientID,
		conversationID: uint(conversationID),
		containerID:    conversation.ContainerID,
		dockerID:       container.DockerID,
		workDir:        container.WorkDir,
		sendChan:       make(chan *headless.HeadlessResponse, 100),
		done:           make(chan struct{}),
	}

	// 启动发送 goroutine
	go client.writePump()

	// 处理连接
	client.handleConnection()
}

// conversationClient 表示一个基于 conversationId 的 WebSocket 客户端
type conversationClient struct {
	handler        *HeadlessHandler
	conn           *websocket.Conn
	clientID       string
	conversationID uint
	containerID    uint
	dockerID       string
	workDir        string
	sendChan       chan *headless.HeadlessResponse
	done           chan struct{}
	session        *headless.HeadlessSession
	eventChan      chan *headless.StreamEvent
	mu             sync.Mutex
}

// handleConnection 处理 WebSocket 连接
func (c *conversationClient) handleConnection() {
	defer func() {
		close(c.done)
		c.cleanup()
	}()

	// 检查是否有活跃会话
	session := c.handler.headlessManager.GetSessionByConversationID(c.conversationID)

	if session != nil {
		c.session = session

		// 如果会话正在运行，先订阅以避免丢事件
		if session.IsRunning() {
			c.subscribeToSession(session)
		}

		// 发送会话信息
		c.sendResponse(headless.HeadlessResponseTypeSessionInfo, session.GetSessionInfo())

		// 加载并发送历史对话
		c.sendHistory(session)
	} else {
		// 无活跃会话，发送历史记录
		c.sendResponse(headless.HeadlessResponseTypeNoSession, gin.H{
			"conversation_id": c.conversationID,
		})
		c.sendHistoryByConversationID()
	}

	// 处理客户端消息
	c.readPump()
}

// sendHistoryByConversationID 通过 conversationID 发送历史
func (c *conversationClient) sendHistoryByConversationID() {
	historyManager := c.handler.headlessManager.GetHistoryManager()
	if historyManager == nil {
		return
	}

	// 获取最近轮次对话
	turns, hasMore, err := historyManager.GetRecentTurns(c.conversationID, defaultHistoryLimit)
	if err != nil {
		log.Printf("[HeadlessHandler] Failed to get recent turns: %v", err)
		return
	}

	// 转换为 TurnInfo
	turnInfos := make([]headless.TurnInfo, len(turns))
	for i, turn := range turns {
		turnInfos[i] = convertTurnToInfo(&turn)
	}

	c.sendResponse(headless.HeadlessResponseTypeHistory, &headless.HistoryPayload{
		Turns:   turnInfos,
		HasMore: hasMore,
	})
}

// sendHistory 发送历史对话
func (c *conversationClient) sendHistory(session *headless.HeadlessSession) {
	historyManager := c.handler.headlessManager.GetHistoryManager()
	if historyManager == nil {
		return
	}

	// 获取最近轮次对话
	turns, hasMore, err := historyManager.GetRecentTurns(session.ConversationID, defaultHistoryLimit)
	if err != nil {
		log.Printf("[HeadlessHandler] Failed to get recent turns: %v", err)
		return
	}

	// 转换为 TurnInfo
	turnInfos := make([]headless.TurnInfo, len(turns))
	for i, turn := range turns {
		turnInfos[i] = convertTurnToInfo(&turn)
	}

	c.sendResponse(headless.HeadlessResponseTypeHistory, &headless.HistoryPayload{
		Turns:   turnInfos,
		HasMore: hasMore,
	})

	// 如果会话正在运行，发送当前轮次的已有事件
	if session.IsRunning() && session.GetCurrentTurnID() > 0 {
		events, err := historyManager.GetCurrentTurnEvents(session.GetCurrentTurnID())
		if err != nil {
			log.Printf("[HeadlessHandler] Failed to get current turn events: %v", err)
			return
		}

		for _, event := range events {
			// 解析原始 JSON 为 StreamEvent
			var evt headless.StreamEvent
			if err := json.Unmarshal([]byte(event.RawJSON), &evt); err == nil {
				c.sendResponse(headless.HeadlessResponseTypeEvent, &evt)
				continue
			}

			// fallback：处理非 JSON 行（stderr/纯文本）
			if fallbackEvt, _ := headless.ParseStreamLine(event.RawJSON); fallbackEvt != nil {
				c.sendResponse(headless.HeadlessResponseTypeEvent, fallbackEvt)
			}
		}
	}
}

// subscribeToSession 订阅会话输出
func (c *conversationClient) subscribeToSession(session *headless.HeadlessSession) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.eventChan != nil {
		return // 已订阅
	}

	c.eventChan = session.AddClient(c.clientID)

	// 使用 ready channel 确保 goroutine 已启动
	ready := make(chan struct{})

	// 启动事件转发 goroutine
	go func() {
		// 通知调用者 goroutine 已启动
		close(ready)

		for {
			select {
			case evt, ok := <-c.eventChan:
				if !ok {
					return
				}
				// 检查是否为轮次完成事件
				if evt.Type == "turn_complete" {
					// 发送轮次完成消息
					var payload headless.TurnCompletePayload
					if evt.Result != "" && json.Unmarshal([]byte(evt.Result), &payload) == nil {
						c.sendResponse(headless.HeadlessResponseTypeTurnComplete, &payload)
					} else {
						c.sendResponse(headless.HeadlessResponseTypeTurnComplete, evt.Result)
					}
				} else {
					c.sendResponse(headless.HeadlessResponseTypeEvent, evt)
				}
			case <-c.done:
				return
			}
		}
	}()

	// 等待 goroutine 启动完成
	<-ready
}

// unsubscribeFromSession 取消订阅会话输出
func (c *conversationClient) unsubscribeFromSession() {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.session != nil && c.eventChan != nil {
		c.session.RemoveClient(c.clientID)
		c.eventChan = nil
	}
}

// cleanup 清理资源
func (c *conversationClient) cleanup() {
	c.unsubscribeFromSession()
	close(c.sendChan)
	log.Printf("[HeadlessHandler] Client %s disconnected from conversation %d", c.clientID, c.conversationID)
}

// readPump 读取客户端消息
func (c *conversationClient) readPump() {
	for {
		_, message, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("[HeadlessHandler] Client %s read error: %v", c.clientID, err)
			} else {
				log.Printf("[HeadlessHandler] Client %s closed: %v", c.clientID, err)
			}
			return
		}

		// 解析消息
		var req headless.HeadlessRequest
		if err := json.Unmarshal(message, &req); err != nil {
			c.sendError(headless.ErrorCodeInvalidRequest, "Invalid request format")
			continue
		}

		// 收到任意消息都延长读超时
		c.conn.SetReadDeadline(time.Now().Add(headlessPongWait))

		// 处理消息
		c.handleMessage(&req)
	}
}

// writePump 发送消息到客户端
func (c *conversationClient) writePump() {
	ticker := time.NewTicker(headlessPingPeriod)
	defer ticker.Stop()

	for {
		select {
		case resp, ok := <-c.sendChan:
			if !ok {
				return
			}
			c.conn.SetWriteDeadline(time.Now().Add(headlessWriteWait))
			if err := c.conn.WriteJSON(resp); err != nil {
				log.Printf("[HeadlessHandler] Client %s write error: %v", c.clientID, err)
				return
			}
		case <-ticker.C:
			// 发送 ping
			c.conn.SetWriteDeadline(time.Now().Add(headlessWriteWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		case <-c.done:
			return
		}
	}
}

// handleMessage 处理客户端消息
func (c *conversationClient) handleMessage(req *headless.HeadlessRequest) {
	switch req.Type {
	case headless.HeadlessRequestTypeStart:
		c.handleStart(req)
	case headless.HeadlessRequestTypePrompt:
		c.handlePrompt(req)
	case headless.HeadlessRequestTypeCancel:
		c.handleCancel(req)
	case headless.HeadlessRequestTypeLoadMore:
		c.handleLoadMore(req)
	case headless.HeadlessRequestTypePing:
		c.sendResponse(headless.HeadlessResponseTypePong, nil)
		return
	default:
		c.sendError(headless.ErrorCodeInvalidRequest, "Unknown request type")
	}
}

// handleStart 处理恢复/创建会话请求
func (c *conversationClient) handleStart(req *headless.HeadlessRequest) {
	// 检查是否已有会话
	if c.session != nil && !c.session.IsClosed() {
		c.sendError(headless.ErrorCodeSessionBusy, "Session already exists")
		return
	}

	// 检查是否有正在运行的会话
	existingSession := c.handler.headlessManager.GetSessionByConversationID(c.conversationID)
	if existingSession != nil && !existingSession.IsClosed() {
		// 恢复到已有会话
		c.session = existingSession
		c.subscribeToSession(existingSession)
		c.sendResponse(headless.HeadlessResponseTypeSessionInfo, existingSession.GetSessionInfo())
		return
	}

	// 切换到 Headless 模式
	closedCount, err := c.handler.modeManager.SwitchToHeadless(c.containerID, c.dockerID)
	if err != nil {
		c.sendError(headless.ErrorCodeModeConflict, err.Error())
		return
	}

	if closedCount > 0 {
		c.sendResponse(headless.HeadlessResponseTypeModeSwitched, &headless.ModeSwitchedPayload{
			Mode:           string(mode.ModeHeadless),
			ClosedSessions: closedCount,
		})
	}

	c.killClaudeProcesses()

	// 创建会话（复用已有的 conversationID）
	workDir := c.workDir
	if payload, ok := req.Payload["work_dir"].(string); ok && payload != "" {
		workDir = payload
	}

	session, err := c.handler.headlessManager.CreateSessionForConversation(c.containerID, c.dockerID, workDir, c.conversationID)
	if err != nil {
		c.sendError(headless.ErrorCodeInternalError, err.Error())
		return
	}

	// 设置监控
	if err := c.handler.headlessManager.SetupMonitoringForSession(session); err != nil {
		log.Printf("[HeadlessHandler] Failed to setup monitoring: %v", err)
	}

	c.session = session

	// 发送会话信息
	c.sendResponse(headless.HeadlessResponseTypeSessionInfo, session.GetSessionInfo())

	// 订阅会话输出
	c.subscribeToSession(session)
}

// handlePrompt 处理发送 prompt 请求
func (c *conversationClient) handlePrompt(req *headless.HeadlessRequest) {
	if c.session == nil {
		c.sendError(headless.ErrorCodeSessionNotFound, "No active session")
		return
	}

	prompt, ok := req.Payload["prompt"].(string)
	if !ok || prompt == "" {
		c.sendError(headless.ErrorCodeInvalidRequest, "Missing prompt")
		return
	}

	source := models.HeadlessPromptSourceUser
	if s, ok := req.Payload["source"].(string); ok && s != "" {
		source = s
	}

	// 获取 model 参数（可选）
	model := ""
	if m, ok := req.Payload["model"].(string); ok && m != "" {
		model = m
	}

	// 确保已订阅
	c.subscribeToSession(c.session)
	time.Sleep(10 * time.Millisecond)

	// 发送 prompt（带 model 参数）
	if err := c.handler.headlessManager.SendPromptWithModel(c.session.ID, prompt, source, model); err != nil {
		c.sendError(headless.ErrorCodeProcessFailed, err.Error())
		return
	}
}

// handleCancel 处理取消执行请求
func (c *conversationClient) handleCancel(req *headless.HeadlessRequest) {
	if c.session == nil {
		c.sendError(headless.ErrorCodeSessionNotFound, "No active session")
		return
	}

	if err := c.handler.headlessManager.CancelExecution(c.session.ID); err != nil {
		c.sendError(headless.ErrorCodeInternalError, err.Error())
		return
	}
}

// handleLoadMore 处理加载更多历史请求
func (c *conversationClient) handleLoadMore(req *headless.HeadlessRequest) {
	beforeTurnID, _ := req.Payload["before_turn_id"].(float64)
	limit, _ := req.Payload["limit"].(float64)
	if limit <= 0 {
		limit = 10
	}

	historyManager := c.handler.headlessManager.GetHistoryManager()
	if historyManager == nil {
		c.sendError(headless.ErrorCodeInternalError, "History manager not available")
		return
	}

	turns, hasMore, err := historyManager.GetTurnsBefore(c.conversationID, uint(beforeTurnID), int(limit))
	if err != nil {
		c.sendError(headless.ErrorCodeInternalError, err.Error())
		return
	}

	// 转换为 TurnInfo
	turnInfos := make([]headless.TurnInfo, len(turns))
	for i, turn := range turns {
		turnInfos[i] = convertTurnToInfo(&turn)
	}

	c.sendResponse(headless.HeadlessResponseTypeHistoryMore, &headless.HistoryPayload{
		Turns:   turnInfos,
		HasMore: hasMore,
	})
}

// sendResponse 发送响应
func (c *conversationClient) sendResponse(respType string, payload interface{}) {
	select {
	case c.sendChan <- &headless.HeadlessResponse{
		Type:    respType,
		Payload: payload,
	}:
	default:
		log.Printf("[HeadlessHandler] Client %s send channel full", c.clientID)
	}
}

// sendError 发送错误响应
func (c *conversationClient) sendError(code, message string) {
	c.sendResponse(headless.HeadlessResponseTypeError, &headless.ErrorPayload{
		Code:    code,
		Message: message,
	})
}

func (c *conversationClient) killClaudeProcesses() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	cmd := []string{"sh", "-c", "pkill -f 'claude' 2>/dev/null || true"}
	if _, err := c.handler.containerService.ExecInContainer(ctx, c.containerID, cmd); err != nil {
		log.Printf("[HeadlessHandler] Failed to kill claude processes in container %d: %v", c.containerID, err)
	}
}

// GetConversation 获取单个对话详情
func (h *HeadlessHandler) GetConversation(c *gin.Context) {
	containerIDStr := c.Param("id")
	conversationIDStr := c.Param("conversationId")

	_, err := strconv.ParseUint(containerIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid container ID"})
		return
	}

	conversationID, err := strconv.ParseUint(conversationIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid conversation ID"})
		return
	}

	historyManager := h.headlessManager.GetHistoryManager()
	if historyManager == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "History manager not available"})
		return
	}

	conversation, err := historyManager.GetConversationByID(uint(conversationID))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if conversation == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Conversation not found"})
		return
	}

	c.JSON(http.StatusOK, conversation)
}

// DeleteConversation 删除对话
func (h *HeadlessHandler) DeleteConversation(c *gin.Context) {
	containerIDStr := c.Param("id")
	conversationIDStr := c.Param("conversationId")

	_, err := strconv.ParseUint(containerIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid container ID"})
		return
	}

	conversationID, err := strconv.ParseUint(conversationIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid conversation ID"})
		return
	}

	// 先关闭后端会话（如果正在运行）
	if err := h.headlessManager.CloseSessionByConversationID(uint(conversationID)); err != nil {
		log.Printf("[HeadlessHandler] Warning: failed to close session for conversation %d: %v", conversationID, err)
	}

	historyManager := h.headlessManager.GetHistoryManager()
	if historyManager == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "History manager not available"})
		return
	}

	if err := historyManager.DeleteConversation(uint(conversationID)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Conversation deleted"})
}

// GetConversationTurns 获取对话的轮次列表
func (h *HeadlessHandler) GetConversationTurns(c *gin.Context) {
	containerIDStr := c.Param("id")
	conversationIDStr := c.Param("conversationId")

	_, err := strconv.ParseUint(containerIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid container ID"})
		return
	}

	conversationID, err := strconv.ParseUint(conversationIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid conversation ID"})
		return
	}

	limit := 10
	if limitStr := c.Query("limit"); limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 {
			limit = l
		}
	}

	// 支持 before 参数用于分页加载更早的历史
	var beforeTurnID uint
	if beforeStr := c.Query("before"); beforeStr != "" {
		if b, err := strconv.ParseUint(beforeStr, 10, 32); err == nil && b > 0 {
			beforeTurnID = uint(b)
		}
	}

	historyManager := h.headlessManager.GetHistoryManager()
	if historyManager == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "History manager not available"})
		return
	}

	var turns []models.HeadlessTurn
	var hasMore bool

	if beforeTurnID > 0 {
		// 加载指定 turn 之前的历史
		turns, hasMore, err = historyManager.GetTurnsBefore(uint(conversationID), beforeTurnID, limit)
	} else {
		// 加载最近的历史
		turns, hasMore, err = historyManager.GetRecentTurns(uint(conversationID), limit)
	}

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// 转换为 TurnInfo
	turnInfos := make([]headless.TurnInfo, len(turns))
	for i, turn := range turns {
		turnInfos[i] = convertTurnToInfo(&turn)
	}

	c.JSON(http.StatusOK, gin.H{
		"turns":    turnInfos,
		"has_more": hasMore,
	})
}
