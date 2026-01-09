package headless

import "testing"

func TestParseStreamLineValidJSON(t *testing.T) {
	line := `{"type":"assistant","message":{"content":[{"type":"text","text":"hi"}]}}`
	evt, ok := ParseStreamLine(line)
	if !ok || evt == nil {
		t.Fatalf("expected valid event")
	}
	if evt.Type != StreamEventTypeAssistant {
		t.Fatalf("unexpected type: %s", evt.Type)
	}
	if evt.Raw == "" {
		t.Fatalf("expected raw")
	}
}

func TestParseStreamLineFallbacks(t *testing.T) {
	evt, ok := ParseStreamLine("[stderr] boom")
	if ok || evt == nil || !evt.IsError || evt.Type != StreamEventTypeResult {
		t.Fatalf("expected stderr fallback result")
	}

	evt, _ = ParseStreamLine("Error: bad")
	if evt == nil || !evt.IsError || evt.Type != StreamEventTypeResult {
		t.Fatalf("expected error prefix fallback")
	}

	evt, _ = ParseStreamLine("hello")
	if evt == nil || evt.Type != StreamEventTypeAssistant || evt.Message == nil {
		t.Fatalf("expected assistant fallback")
	}
	if len(evt.Message.Content) != 1 || evt.Message.Content[0].Text != "hello" {
		t.Fatalf("unexpected fallback content")
	}
}

func TestParseStreamLineEmpty(t *testing.T) {
	evt, ok := ParseStreamLine("  ")
	if ok || evt != nil {
		t.Fatalf("expected empty result")
	}
}

func TestParseFirstTurnResponse(t *testing.T) {
	data := []byte(`{"type":"system","subtype":"init","session_id":"s1"}`)
	evt, err := ParseFirstTurnResponse(data)
	if err != nil {
		t.Fatalf("ParseFirstTurnResponse error: %v", err)
	}
	if evt.SessionID != "s1" || evt.Type != StreamEventTypeSystem {
		t.Fatalf("unexpected first turn event")
	}
	if evt.Raw == "" {
		t.Fatalf("expected raw")
	}
}

func TestExtractUsageInfo(t *testing.T) {
	usage := &UsageInfo{InputTokens: 1, OutputTokens: 2}
	evt := &StreamEvent{Usage: usage}
	if got := ExtractUsageInfo(evt); got == nil || got.InputTokens != 1 {
		t.Fatalf("expected usage from top-level")
	}

	evt = &StreamEvent{Message: &MessagePayload{Usage: usage}}
	if got := ExtractUsageInfo(evt); got == nil || got.OutputTokens != 2 {
		t.Fatalf("expected usage from message")
	}
}

func TestExtractTextContent(t *testing.T) {
	evt := &StreamEvent{
		Message: &MessagePayload{
			Content: []MessageContent{
				{Type: MessageContentTypeText, Text: "a"},
				{Type: MessageContentTypeThinking, Thinking: "b"},
			},
		},
	}
	got := ExtractTextContent(evt)
	if got == "" {
		t.Fatalf("expected text content")
	}
}

func TestToolUseHelpers(t *testing.T) {
	evt := &StreamEvent{
		Message: &MessagePayload{
			Content: []MessageContent{
				{Type: MessageContentTypeToolUse, Name: "bash"},
				{Type: MessageContentTypeText, Text: "x"},
			},
		},
	}
	if !HasToolUse(evt) {
		t.Fatalf("expected tool use")
	}
	uses := GetToolUses(evt)
	if len(uses) != 1 || uses[0].Name != "bash" {
		t.Fatalf("unexpected tool uses")
	}
}
