package headless

import (
	"encoding/json"
	"strings"
)

// ParseStreamLine 解析单行 stream-json 输出
// 返回：解析后的事件、是否为有效 JSON
func ParseStreamLine(line string) (*StreamEvent, bool) {
	line = strings.TrimSpace(line)
	if line == "" {
		return nil, false
	}

	// 过滤 ANSI 转义序列（TTY 模式下会产生这些控制字符）
	// 常见的 ANSI 序列：\x1b[...m (颜色), \x1b[?25h/l (光标显示/隐藏), \x1b[K (清行) 等
	if isANSIEscapeSequence(line) {
		return nil, false
	}

	// 尝试 JSON 解析
	var evt StreamEvent
	if err := json.Unmarshal([]byte(line), &evt); err == nil {
		// 检查是否有 type 字段（有效的 Claude 事件）
		if evt.Type != "" {
			evt.Raw = line
			return &evt, true
		}
	}

	// 解析失败或无 type 字段，创建 fallback 事件
	return createFallbackEvent(line), false
}

// isANSIEscapeSequence 检查字符串是否只包含 ANSI 转义序列
func isANSIEscapeSequence(s string) bool {
	// 移除所有 ANSI 转义序列后检查是否为空
	cleaned := stripANSI(s)
	return strings.TrimSpace(cleaned) == ""
}

// stripANSI 移除字符串中的 ANSI 转义序列
func stripANSI(s string) string {
	// ANSI 转义序列格式：ESC [ ... 终止字符
	// ESC = \x1b 或 \033
	result := strings.Builder{}
	i := 0
	for i < len(s) {
		if i < len(s)-1 && (s[i] == '\x1b' || s[i] == '\033') {
			// 找到 ESC，跳过整个转义序列
			j := i + 1
			if j < len(s) && s[j] == '[' {
				// CSI 序列：ESC [ ... 终止字符 (字母)
				j++
				for j < len(s) && !isCSITerminator(s[j]) {
					j++
				}
				if j < len(s) {
					j++ // 跳过终止字符
				}
			} else if j < len(s) && s[j] == ']' {
				// OSC 序列：ESC ] ... BEL 或 ESC \
				j++
				for j < len(s) && s[j] != '\x07' && !(j+1 < len(s) && s[j] == '\x1b' && s[j+1] == '\\') {
					j++
				}
				if j < len(s) {
					if s[j] == '\x07' {
						j++
					} else if j+1 < len(s) {
						j += 2
					}
				}
			}
			i = j
		} else {
			result.WriteByte(s[i])
			i++
		}
	}
	return result.String()
}

// isCSITerminator 检查字符是否为 CSI 序列的终止字符
func isCSITerminator(c byte) bool {
	return (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || c == '@' || c == '`'
}

// createFallbackEvent 创建 fallback 事件
// 用于处理无法解析为 JSON 的行
func createFallbackEvent(line string) *StreamEvent {
	// 检查是否为 stderr 行
	if strings.HasPrefix(line, "[stderr] ") {
		text := strings.TrimPrefix(line, "[stderr] ")
		return &StreamEvent{
			Type:    StreamEventTypeResult,
			IsError: true,
			Result:  text,
			Raw:     line,
		}
	}

	// 检查是否为错误信息
	if strings.HasPrefix(line, "Error:") || strings.HasPrefix(line, "error:") {
		return &StreamEvent{
			Type:    StreamEventTypeResult,
			IsError: true,
			Result:  line,
			Raw:     line,
		}
	}

	// 普通文本行，包装为 assistant 消息
	return &StreamEvent{
		Type: StreamEventTypeAssistant,
		Message: &MessagePayload{
			Content: []MessageContent{
				{
					Type: MessageContentTypeText,
					Text: line,
				},
			},
		},
		Raw: line,
	}
}

// ParseFirstTurnResponse 解析首轮 JSON 响应
// 首轮使用 --output-format json，返回完整的 JSON 对象
func ParseFirstTurnResponse(data []byte) (*StreamEvent, error) {
	var evt StreamEvent
	if err := json.Unmarshal(data, &evt); err != nil {
		return nil, err
	}
	evt.Raw = string(data)
	return &evt, nil
}

// ExtractSessionID 从事件中提取 session_id
func ExtractSessionID(evt *StreamEvent) string {
	if evt == nil {
		return ""
	}
	return evt.SessionID
}

// ExtractUsageInfo 从事件中提取 usage 信息
func ExtractUsageInfo(evt *StreamEvent) *UsageInfo {
	if evt == nil {
		return nil
	}

	// 优先从顶层 Usage 获取
	if evt.Usage != nil {
		return evt.Usage
	}

	// 从 Message.Usage 获取
	if evt.Message != nil && evt.Message.Usage != nil {
		return evt.Message.Usage
	}

	return nil
}

// ExtractTextContent 从事件中提取文本内容
func ExtractTextContent(evt *StreamEvent) string {
	if evt == nil || evt.Message == nil {
		return ""
	}

	var texts []string
	for _, content := range evt.Message.Content {
		switch content.Type {
		case MessageContentTypeText:
			if content.Text != "" {
				texts = append(texts, content.Text)
			}
		case MessageContentTypeThinking:
			if content.Thinking != "" {
				texts = append(texts, "[Thinking] "+content.Thinking)
			}
		}
	}

	return strings.Join(texts, "\n")
}

// IsResultEvent 检查是否为结果事件（表示轮次结束）
func IsResultEvent(evt *StreamEvent) bool {
	return evt != nil && evt.Type == StreamEventTypeResult
}

// IsSystemEvent 检查是否为系统事件
func IsSystemEvent(evt *StreamEvent) bool {
	return evt != nil && evt.Type == StreamEventTypeSystem
}

// IsAssistantEvent 检查是否为助手事件
func IsAssistantEvent(evt *StreamEvent) bool {
	return evt != nil && evt.Type == StreamEventTypeAssistant
}

// HasToolUse 检查事件是否包含工具调用
func HasToolUse(evt *StreamEvent) bool {
	if evt == nil || evt.Message == nil {
		return false
	}

	for _, content := range evt.Message.Content {
		if content.Type == MessageContentTypeToolUse {
			return true
		}
	}

	return false
}

// GetToolUses 获取事件中的所有工具调用
func GetToolUses(evt *StreamEvent) []MessageContent {
	if evt == nil || evt.Message == nil {
		return nil
	}

	var toolUses []MessageContent
	for _, content := range evt.Message.Content {
		if content.Type == MessageContentTypeToolUse {
			toolUses = append(toolUses, content)
		}
	}

	return toolUses
}
