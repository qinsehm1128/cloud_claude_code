package headless

import (
	"bufio"
	"bytes"
	"context"
	"fmt"
	"io"
	"log"
	"strings"
	"sync"
	"time"

	"github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/client"
	"github.com/docker/docker/pkg/stdcopy"
)

// DefaultTTYCols 默认终端宽度
const DefaultTTYCols = 120

// DefaultTTYRows 默认终端高度
const DefaultTTYRows = 40

// StartClaudeProcess 启动 Claude 进程
func (s *HeadlessSession) StartClaudeProcess(ctx context.Context, prompt string) error {
	// 检查状态
	if s.GetState() == HeadlessStateRunning {
		return fmt.Errorf("session is already running")
	}
	if s.GetState() == HeadlessStateClosed {
		return fmt.Errorf("session is closed")
	}

	// 构建命令参数
	args := s.buildClaudeArgs(prompt)
	
	// 完整命令：claude + args
	cmd := append([]string{"claude"}, args...)

	log.Printf("[HeadlessSession %s] Starting Claude process with cmd: %v", s.ID, cmd)

	// 使用 Docker API 而不是 exec.Command
	cli, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		return fmt.Errorf("failed to create docker client: %w", err)
	}

	// 确保工作目录存在（防止 "no such file or directory" 错误）
	// 必须在创建 Claude exec 之前完成，因为 Docker 会验证 WorkingDir 存在
	workDir := s.WorkDir
	if workDir == "" {
		workDir = "/app"
	}
	log.Printf("[HeadlessSession %s] Ensuring WorkDir exists: %s", s.ID, workDir)

	// 使用 sh -c 执行，确保命令在容器内正确运行
	ensureDirConfig := types.ExecConfig{
		Cmd:          []string{"sh", "-c", fmt.Sprintf("mkdir -p '%s' && echo 'OK'", workDir)},
		AttachStdout: true,
		AttachStderr: true,
	}
	ensureDirResp, err := cli.ContainerExecCreate(ctx, s.DockerID, ensureDirConfig)
	if err != nil {
		cli.Close()
		return fmt.Errorf("failed to create mkdir exec for WorkDir %s: %w", workDir, err)
	}

	// 使用 Attach 并等待命令完成
	attachResp, err := cli.ContainerExecAttach(ctx, ensureDirResp.ID, types.ExecStartCheck{})
	if err != nil {
		cli.Close()
		return fmt.Errorf("failed to attach mkdir exec for WorkDir %s: %w", workDir, err)
	}

	// 读取输出并等待完成
	output, _ := io.ReadAll(attachResp.Reader)
	attachResp.Close()
	log.Printf("[HeadlessSession %s] mkdir output: %s", s.ID, string(output))

	// 检查 exec 退出码
	inspectResp, err := cli.ContainerExecInspect(ctx, ensureDirResp.ID)
	if err != nil {
		log.Printf("[HeadlessSession %s] Warning: failed to inspect mkdir exec: %v", s.ID, err)
	} else if inspectResp.ExitCode != 0 {
		cli.Close()
		return fmt.Errorf("failed to create WorkDir %s: exit code %d", workDir, inspectResp.ExitCode)
	}
	log.Printf("[HeadlessSession %s] WorkDir %s ensured to exist", s.ID, workDir)

	// 更新 WorkDir（以防原来是空字符串）
	s.WorkDir = workDir

	// 创建 exec 实例 - 必须启用 TTY，否则 claude CLI 可能卡住或不输出
	execConfig := types.ExecConfig{
		Cmd:          cmd,
		AttachStdin:  true,
		AttachStdout: true,
		AttachStderr: true,
		Tty:          true, // 必须为 true，claude CLI 依赖 TTY
		WorkingDir:   s.WorkDir,
		Env: []string{
			"TERM=xterm-256color", // 必须设置 TERM，否则 claude 可能卡在终端检测
			"FORCE_COLOR=0",
			"NO_COLOR=1",
			"CI=true",
		},
	}

	execResp, err := cli.ContainerExecCreate(ctx, s.DockerID, execConfig)
	if err != nil {
		cli.Close()
		return fmt.Errorf("failed to create exec: %w", err)
	}

	log.Printf("[HeadlessSession %s] Created exec instance: %s", s.ID, execResp.ID)

	// 附加到 exec 实例 - Tty 必须与 execConfig 一致
	attachResp, err := cli.ContainerExecAttach(ctx, execResp.ID, types.ExecStartCheck{
		Tty: true,
	})
	if err != nil {
		cli.Close()
		return fmt.Errorf("failed to attach to exec: %w", err)
	}

	// 必须设置 TTY 大小，否则 claude 可能因为 width=0 而崩溃或拒绝输出
	if err := cli.ContainerExecResize(ctx, execResp.ID, container.ResizeOptions{
		Width:  DefaultTTYCols,
		Height: DefaultTTYRows,
	}); err != nil {
		log.Printf("[HeadlessSession %s] Warning: failed to resize TTY: %v", s.ID, err)
		// 不返回错误，继续执行
	}

	// 保存引用
	s.dockerClient = cli
	s.execID = execResp.ID
	s.hijackedResp = &attachResp

	log.Printf("[HeadlessSession %s] Claude process started, exec ID: %s", s.ID, execResp.ID)

	// 更新状态
	s.SetState(HeadlessStateRunning)

	// 创建用于取消的 context
	readCtx, cancel := context.WithCancel(ctx)
	s.cancelRead = cancel

	// 启动输出读取 goroutine - 使用 TTY 模式的直接读取
	go s.readDockerOutputTTY(readCtx, &attachResp)

	// 启动进程状态检查 goroutine
	go s.waitDockerExec(ctx, cli, execResp.ID)

	return nil
}

// buildClaudeArgs 构建 Claude 命令参数
func (s *HeadlessSession) buildClaudeArgs(prompt string) []string {
	var args []string

	// 参考 claude-code-client 的参数顺序
	// --output-format stream-json --verbose --dangerously-skip-permissions -p <prompt>
	
	// 输出格式
	args = append(args, "--output-format", "stream-json")
	
	// 详细输出模式（重要！确保输出完整信息）
	args = append(args, "--verbose")
	
	// 跳过权限检查
	args = append(args, "--dangerously-skip-permissions")

	// 如果指定了模型，添加 --model 参数
	if s.Model != "" {
		args = append(args, "--model", s.Model)
	}

	// 如果有 session_id，使用 resume
	if s.ClaudeSessionID != "" {
		args = append(args, "--resume", s.ClaudeSessionID)
	}

	// 添加 prompt（放在最后）
	args = append(args, "-p", prompt)

	return args
}

// readDockerOutputTTY 从 Docker hijacked 连接读取 TTY 输出
// 当 Tty=true 时，stdout 和 stderr 合并输出，直接读取即可
func (s *HeadlessSession) readDockerOutputTTY(ctx context.Context, resp *types.HijackedResponse) {
	defer func() {
		resp.Close()
		log.Printf("[HeadlessSession %s] Docker TTY output reader closed", s.ID)
	}()

	log.Printf("[HeadlessSession %s] Starting Docker TTY output reader...", s.ID)

	// 使用较大的缓冲区，实时读取
	buf := make([]byte, 4096)
	var lineBuf bytes.Buffer
	lineCount := 0

	for {
		select {
		case <-ctx.Done():
			log.Printf("[HeadlessSession %s] Context cancelled, stopping TTY output read", s.ID)
			// 处理缓冲区中剩余的数据
			if lineBuf.Len() > 0 {
				s.processLine(lineBuf.String(), &lineCount)
			}
			return
		default:
		}

		// 直接从 Reader 读取，实时消费数据避免缓冲区阻塞
		n, err := resp.Reader.Read(buf)
		if err != nil {
			if err != io.EOF {
				log.Printf("[HeadlessSession %s] TTY read error: %v", s.ID, err)
			}
			// 处理缓冲区中剩余的数据
			if lineBuf.Len() > 0 {
				s.processLine(lineBuf.String(), &lineCount)
			}
			log.Printf("[HeadlessSession %s] TTY EOF reached, total lines: %d", s.ID, lineCount)
			return
		}

		if n > 0 {
			// 将数据追加到行缓冲区
			lineBuf.Write(buf[:n])

			// 按行处理
			for {
				line, err := lineBuf.ReadString('\n')
				if err != nil {
					// 没有完整的行，将数据放回缓冲区
					lineBuf.WriteString(line)
					break
				}
				s.processLine(line, &lineCount)
			}
		}
	}
}

// processLine 处理单行输出
func (s *HeadlessSession) processLine(line string, lineCount *int) {
	line = strings.TrimSpace(line)
	if line == "" {
		return
	}

	*lineCount++
	logLine := line
	if len(logLine) > 200 {
		logLine = logLine[:200] + "..."
	}
	log.Printf("[HeadlessSession %s] TTY line %d (len=%d): %s", s.ID, *lineCount, len(line), logLine)

	evt, isValidJSON := ParseStreamLine(line)
	if evt == nil {
		log.Printf("[HeadlessSession %s] ParseStreamLine returned nil for line %d", s.ID, *lineCount)
		return
	}

	log.Printf("[HeadlessSession %s] Parsed event type: %s, isValidJSON: %v", s.ID, evt.Type, isValidJSON)
	s.OnStreamEvent(evt)

	if IsResultEvent(evt) {
		log.Printf("[HeadlessSession %s] Result event received, turn completing", s.ID)
		if evt.IsError {
			s.OnTurnComplete(false, evt.Error)
		} else {
			s.OnTurnComplete(true, "")
		}
	}
}

// readDockerOutput 从 Docker hijacked 连接读取输出 (保留用于 Tty=false 的情况)
func (s *HeadlessSession) readDockerOutput(ctx context.Context, resp *types.HijackedResponse) {
	defer func() {
		resp.Close()
		log.Printf("[HeadlessSession %s] Docker output reader closed", s.ID)
	}()

	log.Printf("[HeadlessSession %s] Starting Docker output reader (using stdcopy)...", s.ID)

	// 使用 stdcopy 解析 multiplexed stream
	// 当 Tty=false 时，Docker 使用 multiplexed stream 格式
	var stdoutBuf, stderrBuf bytes.Buffer
	
	// 在后台持续读取
	go func() {
		_, err := stdcopy.StdCopy(&stdoutBuf, &stderrBuf, resp.Reader)
		if err != nil && err != io.EOF {
			log.Printf("[HeadlessSession %s] stdcopy error: %v", s.ID, err)
		}
		log.Printf("[HeadlessSession %s] stdcopy finished", s.ID)
	}()

	// 定期检查缓冲区并处理输出
	ticker := time.NewTicker(50 * time.Millisecond)
	defer ticker.Stop()

	lineCount := 0
	var lastStdoutLen, lastStderrLen int

	for {
		select {
		case <-ctx.Done():
			log.Printf("[HeadlessSession %s] Context cancelled, stopping output read", s.ID)
			return
		case <-ticker.C:
			// 处理 stdout
			if stdoutBuf.Len() > lastStdoutLen {
				newData := stdoutBuf.Bytes()[lastStdoutLen:]
				lastStdoutLen = stdoutBuf.Len()
				
				// 按行处理
				lines := strings.Split(string(newData), "\n")
				for _, line := range lines {
					line = strings.TrimSpace(line)
					if line == "" {
						continue
					}

					lineCount++
					logLine := line
					if len(logLine) > 200 {
						logLine = logLine[:200] + "..."
					}
					log.Printf("[HeadlessSession %s] stdout line %d (len=%d): %s", s.ID, lineCount, len(line), logLine)

					evt, isValidJSON := ParseStreamLine(line)
					if evt == nil {
						log.Printf("[HeadlessSession %s] ParseStreamLine returned nil for line %d", s.ID, lineCount)
						continue
					}

					log.Printf("[HeadlessSession %s] Parsed event type: %s, isValidJSON: %v", s.ID, evt.Type, isValidJSON)
					s.OnStreamEvent(evt)

					if IsResultEvent(evt) {
						log.Printf("[HeadlessSession %s] Result event received, turn completing", s.ID)
						if evt.IsError {
							s.OnTurnComplete(false, evt.Error)
						} else {
							s.OnTurnComplete(true, "")
						}
					}
				}
			}

			// 处理 stderr
			if stderrBuf.Len() > lastStderrLen {
				newData := stderrBuf.Bytes()[lastStderrLen:]
				lastStderrLen = stderrBuf.Len()
				
				lines := strings.Split(string(newData), "\n")
				for _, line := range lines {
					line = strings.TrimSpace(line)
					if line == "" {
						continue
					}

					log.Printf("[HeadlessSession %s] stderr: %s", s.ID, line)
					evt := &StreamEvent{
						Type:    StreamEventTypeResult,
						IsError: true,
						Result:  line,
						Raw:     "[stderr] " + line,
					}
					s.OnStreamEvent(evt)
				}
			}
		}
	}
}

// waitDockerExec 等待 Docker exec 完成
func (s *HeadlessSession) waitDockerExec(ctx context.Context, cli *client.Client, execID string) {
	// 轮询检查 exec 状态
	ticker := time.NewTicker(500 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			log.Printf("[HeadlessSession %s] Context cancelled while waiting for exec", s.ID)
			return
		case <-ticker.C:
			inspect, err := cli.ContainerExecInspect(ctx, execID)
			if err != nil {
				log.Printf("[HeadlessSession %s] Failed to inspect exec: %v", s.ID, err)
				continue
			}

			if !inspect.Running {
				log.Printf("[HeadlessSession %s] Exec finished with exit code: %d", s.ID, inspect.ExitCode)
				
				// 如果还在 running 状态，说明没有收到 result 事件，手动完成
				if s.GetState() == HeadlessStateRunning {
					if inspect.ExitCode != 0 {
						s.OnTurnComplete(false, fmt.Sprintf("Process exited with code %d", inspect.ExitCode))
					} else {
						s.OnTurnComplete(true, "")
					}
				}
				return
			}
		}
	}
}

// readOutput 读取进程输出 (保留用于兼容，但不再使用)
func (s *HeadlessSession) readOutput(ctx context.Context) {
	var wg sync.WaitGroup

	// 读取 stdout
	wg.Add(1)
	go func() {
		defer wg.Done()
		s.readStdout(ctx)
	}()

	// 读取 stderr
	wg.Add(1)
	go func() {
		defer wg.Done()
		s.readStderr(ctx)
	}()

	wg.Wait()
	log.Printf("[HeadlessSession %s] Output reading completed", s.ID)
}

// readStdout 读取 stdout (保留用于兼容)
func (s *HeadlessSession) readStdout(ctx context.Context) {
	if s.stdout == nil {
		log.Printf("[HeadlessSession %s] stdout is nil, cannot read", s.ID)
		return
	}

	log.Printf("[HeadlessSession %s] Starting stdout reader...", s.ID)
	
	scanner := bufio.NewScanner(s.stdout)
	buf := make([]byte, 0, 1024*1024)
	scanner.Buffer(buf, 10*1024*1024)
	
	lineCount := 0

	for scanner.Scan() {
		select {
		case <-ctx.Done():
			log.Printf("[HeadlessSession %s] Context cancelled, stopping stdout read", s.ID)
			return
		default:
		}

		line := scanner.Text()
		line = strings.TrimSpace(line)
		
		if line == "" {
			continue
		}

		lineCount++
		
		logLine := line
		if len(logLine) > 200 {
			logLine = logLine[:200] + "..."
		}
		log.Printf("[HeadlessSession %s] stdout line %d (len=%d): %s", s.ID, lineCount, len(line), logLine)

		evt, isValidJSON := ParseStreamLine(line)

		if evt == nil {
			log.Printf("[HeadlessSession %s] ParseStreamLine returned nil for line %d", s.ID, lineCount)
			continue
		}

		log.Printf("[HeadlessSession %s] Parsed event type: %s, isValidJSON: %v", s.ID, evt.Type, isValidJSON)

		s.OnStreamEvent(evt)

		if IsResultEvent(evt) {
			log.Printf("[HeadlessSession %s] Result event received, turn completing", s.ID)
			if evt.IsError {
				s.OnTurnComplete(false, evt.Error)
			} else {
				s.OnTurnComplete(true, "")
			}
		}
	}

	if err := scanner.Err(); err != nil {
		log.Printf("[HeadlessSession %s] Scanner error: %v", s.ID, err)
	}

	log.Printf("[HeadlessSession %s] stdout EOF reached, total lines: %d", s.ID, lineCount)
}

// readStderr 读取 stderr (保留用于兼容)
func (s *HeadlessSession) readStderr(ctx context.Context) {
	if s.stderr == nil {
		return
	}

	log.Printf("[HeadlessSession %s] Starting stderr reader...", s.ID)
	
	scanner := bufio.NewScanner(s.stderr)
	buf := make([]byte, 0, 1024*1024)
	scanner.Buffer(buf, 10*1024*1024)
	
	lineCount := 0

	for scanner.Scan() {
		select {
		case <-ctx.Done():
			return
		default:
		}

		line := scanner.Text()
		line = strings.TrimSpace(line)
		
		if line == "" {
			continue
		}

		lineCount++
		log.Printf("[HeadlessSession %s] stderr line %d: %s", s.ID, lineCount, line)

		evt := &StreamEvent{
			Type:    StreamEventTypeResult,
			IsError: true,
			Result:  line,
			Raw:     "[stderr] " + line,
		}

		s.OnStreamEvent(evt)
	}

	if err := scanner.Err(); err != nil {
		log.Printf("[HeadlessSession %s] Stderr scanner error: %v", s.ID, err)
	}

	log.Printf("[HeadlessSession %s] stderr EOF reached, total lines: %d", s.ID, lineCount)
}

// waitProcess 等待进程结束 (保留用于兼容)
func (s *HeadlessSession) waitProcess(ctx context.Context) {
	if s.cmd == nil {
		return
	}

	err := s.cmd.Wait()

	s.cleanupPipes()

	if err != nil {
		if ctx.Err() != nil {
			log.Printf("[HeadlessSession %s] Process cancelled", s.ID)
		} else {
			log.Printf("[HeadlessSession %s] Process exited with error: %v", s.ID, err)
			if s.GetState() == HeadlessStateRunning {
				s.OnTurnComplete(false, fmt.Sprintf("Process exited with error: %v", err))
			}
		}
	} else {
		log.Printf("[HeadlessSession %s] Process exited normally", s.ID)
		if s.GetState() == HeadlessStateRunning {
			s.OnTurnComplete(true, "")
		}
	}

	select {
	case <-s.DoneChan:
	default:
	}
}

// cleanupPipes 清理管道
func (s *HeadlessSession) cleanupPipes() {
	if s.stdin != nil {
		s.stdin.Close()
		s.stdin = nil
	}
	if s.stdout != nil {
		s.stdout.Close()
		s.stdout = nil
	}
	if s.stderr != nil {
		s.stderr.Close()
		s.stderr = nil
	}
}

// CancelExecution 取消当前执行
func (s *HeadlessSession) CancelExecution() error {
	if s.GetState() != HeadlessStateRunning {
		return fmt.Errorf("session is not running")
	}

	log.Printf("[HeadlessSession %s] Cancelling execution", s.ID)

	// 取消读取
	if s.cancelRead != nil {
		s.cancelRead()
	}

	// 关闭 hijacked 连接
	if s.hijackedResp != nil {
		s.hijackedResp.Close()
	}

	// 关闭 Docker 客户端
	if s.dockerClient != nil {
		s.dockerClient.Close()
	}

	// 标记轮次失败
	s.OnTurnComplete(false, "Execution cancelled by user")

	return nil
}

// SendInput 发送输入到进程
func (s *HeadlessSession) SendInput(input string) error {
	if s.hijackedResp != nil {
		_, err := s.hijackedResp.Conn.Write([]byte(input + "\n"))
		return err
	}
	
	if s.stdin == nil {
		return fmt.Errorf("stdin is not available")
	}

	_, err := s.stdin.Write([]byte(input + "\n"))
	return err
}
