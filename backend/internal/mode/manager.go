package mode

import (
	"fmt"
	"log"
	"sync"

	"cc-platform/internal/headless"
	"cc-platform/internal/monitoring"
	"cc-platform/internal/terminal"
)

// ContainerMode 表示容器的运行模式
type ContainerMode string

const (
	// ModeTUI 传统终端模式
	ModeTUI ContainerMode = "tui"
	// ModeHeadless Headless 卡片模式
	ModeHeadless ContainerMode = "headless"
)

// ModeManager 管理容器的运行模式
type ModeManager struct {
	terminalService *terminal.TerminalService
	headlessManager *headless.HeadlessManager
	monitoringMgr   *monitoring.Manager

	// 容器当前模式
	containerModes map[uint]ContainerMode
	mu             sync.RWMutex

	// 模式切换回调
	onModeSwitch func(containerID uint, mode ContainerMode, closedSessions int)
}

// NewModeManager 创建新的 ModeManager
func NewModeManager(
	terminalService *terminal.TerminalService,
	headlessManager *headless.HeadlessManager,
	monitoringMgr *monitoring.Manager,
) *ModeManager {
	return &ModeManager{
		terminalService: terminalService,
		headlessManager: headlessManager,
		monitoringMgr:   monitoringMgr,
		containerModes:  make(map[uint]ContainerMode),
	}
}

// SetOnModeSwitch 设置模式切换回调
func (m *ModeManager) SetOnModeSwitch(callback func(containerID uint, mode ContainerMode, closedSessions int)) {
	m.onModeSwitch = callback
}

// GetMode 获取容器当前模式
func (m *ModeManager) GetMode(containerID uint) ContainerMode {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if mode, ok := m.containerModes[containerID]; ok {
		return mode
	}
	return ModeTUI // 默认 TUI 模式
}

// SetMode 设置容器模式（内部使用）
func (m *ModeManager) setMode(containerID uint, mode ContainerMode) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.containerModes[containerID] = mode
}

// SwitchToHeadless 切换到 Headless 模式
func (m *ModeManager) SwitchToHeadless(containerID uint, dockerID string) (int, error) {
	currentMode := m.GetMode(containerID)
	if currentMode == ModeHeadless {
		// 已经是 Headless 模式，但仍确保 PTY 和监控会话被清理
		closedCount := 0
		if m.terminalService != nil {
			closed := m.terminalService.CloseSessionsForDockerID(dockerID)
			closedCount += closed
			if closed == 0 {
				fallbackClosed := m.terminalService.CloseSessionsForContainer(containerID)
				closedCount += fallbackClosed
				if fallbackClosed > 0 {
					log.Printf("[ModeManager] Closed %d PTY sessions by container ID %d", fallbackClosed, containerID)
				}
			}
			if closedCount > 0 {
				log.Printf("[ModeManager] Closed %d PTY sessions for container %d (mode already headless)", closedCount, containerID)
			}
		}
		if m.monitoringMgr != nil {
			m.monitoringMgr.RemoveAllSessionsForContainer(containerID)
			log.Printf("[ModeManager] Removed monitoring sessions for container %d (mode already headless)", containerID)
		}
		return closedCount, nil
	}

	log.Printf("[ModeManager] Switching container %d to Headless mode", containerID)

	closedCount := 0

	// 1. 关闭所有 PTY 会话
	if m.terminalService != nil {
		closed := m.terminalService.CloseSessionsForDockerID(dockerID)
		closedCount += closed
		// Fallback: some sessions may be keyed by container ID
		if closed == 0 {
			fallbackClosed := m.terminalService.CloseSessionsForContainer(containerID)
			closedCount += fallbackClosed
			if fallbackClosed > 0 {
				log.Printf("[ModeManager] Closed %d PTY sessions by container ID %d", fallbackClosed, containerID)
			}
		}
		log.Printf("[ModeManager] Closed %d PTY sessions for container %d", closedCount, containerID)
	}

	// 2. 清理监控会话（PTY 相关的）
	if m.monitoringMgr != nil {
		m.monitoringMgr.RemoveAllSessionsForContainer(containerID)
		log.Printf("[ModeManager] Removed monitoring sessions for container %d", containerID)
	}

	// 3. 更新模式
	m.setMode(containerID, ModeHeadless)

	// 4. 触发回调
	if m.onModeSwitch != nil {
		m.onModeSwitch(containerID, ModeHeadless, closedCount)
	}

	log.Printf("[ModeManager] Container %d switched to Headless mode, closed %d sessions", containerID, closedCount)

	return closedCount, nil
}

// SwitchToTUI 切换到 TUI 模式
func (m *ModeManager) SwitchToTUI(containerID uint) (int, error) {
	currentMode := m.GetMode(containerID)
	if currentMode == ModeTUI {
		return 0, nil // 已经是 TUI 模式
	}

	log.Printf("[ModeManager] Switching container %d to TUI mode", containerID)

	closedCount := 0

	// 1. 关闭所有 Headless 会话
	if m.headlessManager != nil {
		closed := m.headlessManager.CloseSessionsForContainer(containerID)
		closedCount += closed
		log.Printf("[ModeManager] Closed %d Headless sessions for container %d", closed, containerID)
	}

	// 2. 更新模式
	m.setMode(containerID, ModeTUI)

	// 3. 触发回调
	if m.onModeSwitch != nil {
		m.onModeSwitch(containerID, ModeTUI, closedCount)
	}

	log.Printf("[ModeManager] Container %d switched to TUI mode, closed %d sessions", containerID, closedCount)

	return closedCount, nil
}

// CanCreatePTY 检查是否可以创建 PTY 会话
func (m *ModeManager) CanCreatePTY(containerID uint) bool {
	return m.GetMode(containerID) == ModeTUI
}

// CanCreateHeadless 检查是否可以创建 Headless 会话
func (m *ModeManager) CanCreateHeadless(containerID uint) bool {
	return m.GetMode(containerID) == ModeHeadless
}

// EnsureMode 确保容器处于指定模式
func (m *ModeManager) EnsureMode(containerID uint, dockerID string, targetMode ContainerMode) (int, error) {
	currentMode := m.GetMode(containerID)
	if currentMode == targetMode {
		return 0, nil
	}

	switch targetMode {
	case ModeHeadless:
		return m.SwitchToHeadless(containerID, dockerID)
	case ModeTUI:
		return m.SwitchToTUI(containerID)
	default:
		return 0, fmt.Errorf("unknown mode: %s", targetMode)
	}
}

// ClearMode 清除容器模式（容器删除时调用）
func (m *ModeManager) ClearMode(containerID uint) {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.containerModes, containerID)
}

// GetAllModes 获取所有容器模式（用于调试）
func (m *ModeManager) GetAllModes() map[uint]ContainerMode {
	m.mu.RLock()
	defer m.mu.RUnlock()

	modes := make(map[uint]ContainerMode)
	for k, v := range m.containerModes {
		modes[k] = v
	}
	return modes
}
