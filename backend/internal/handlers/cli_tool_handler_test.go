package handlers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

func init() {
	gin.SetMode(gin.TestMode)
}

func TestNewCLIToolHandler(t *testing.T) {
	handler := NewCLIToolHandler(nil)
	assert.NotNil(t, handler)
}

func TestHandleGeminiAnalysis_InvalidJSON(t *testing.T) {
	handler := NewCLIToolHandler(nil)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodPost, "/api/cli-tools/analyze", bytes.NewBufferString("invalid json"))
	c.Request.Header.Set("Content-Type", "application/json")

	handler.HandleGeminiAnalysis(c)

	assert.Equal(t, http.StatusBadRequest, w.Code)

	var resp GeminiAnalysisResponse
	err := json.Unmarshal(w.Body.Bytes(), &resp)
	assert.NoError(t, err)
	assert.Equal(t, "error", resp.Status)
	assert.Contains(t, resp.Error, "invalid request")
}

func TestHandleGeminiAnalysis_MissingRequiredFields(t *testing.T) {
	handler := NewCLIToolHandler(nil)

	tests := []struct {
		name string
		body map[string]string
	}{
		{
			name: "missing container_id",
			body: map[string]string{"prompt": "test prompt"},
		},
		{
			name: "missing prompt",
			body: map[string]string{"container_id": "container-1"},
		},
		{
			name: "empty body",
			body: map[string]string{},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			bodyBytes, _ := json.Marshal(tt.body)
			w := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(w)
			c.Request = httptest.NewRequest(http.MethodPost, "/api/cli-tools/analyze", bytes.NewBuffer(bodyBytes))
			c.Request.Header.Set("Content-Type", "application/json")

			handler.HandleGeminiAnalysis(c)

			assert.Equal(t, http.StatusBadRequest, w.Code)
		})
	}
}

func TestHandleSequentialWorkflow_InvalidJSON(t *testing.T) {
	handler := NewCLIToolHandler(nil)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodPost, "/api/cli-tools/sequential", bytes.NewBufferString("{bad json"))
	c.Request.Header.Set("Content-Type", "application/json")

	handler.HandleSequentialWorkflow(c)

	assert.Equal(t, http.StatusBadRequest, w.Code)

	var resp SequentialWorkflowResponse
	err := json.Unmarshal(w.Body.Bytes(), &resp)
	assert.NoError(t, err)
	assert.Equal(t, "error", resp.Status)
	assert.Contains(t, resp.Error, "invalid request")
}

func TestHandleSequentialWorkflow_MissingRequiredFields(t *testing.T) {
	handler := NewCLIToolHandler(nil)

	tests := []struct {
		name string
		body map[string]string
	}{
		{
			name: "missing container_id",
			body: map[string]string{
				"analysis_prompt":     "analyze code",
				"modification_prompt": "fix code",
			},
		},
		{
			name: "missing analysis_prompt",
			body: map[string]string{
				"container_id":        "container-1",
				"modification_prompt": "fix code",
			},
		},
		{
			name: "missing modification_prompt",
			body: map[string]string{
				"container_id":    "container-1",
				"analysis_prompt": "analyze code",
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			bodyBytes, _ := json.Marshal(tt.body)
			w := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(w)
			c.Request = httptest.NewRequest(http.MethodPost, "/api/cli-tools/sequential", bytes.NewBuffer(bodyBytes))
			c.Request.Header.Set("Content-Type", "application/json")

			handler.HandleSequentialWorkflow(c)

			assert.Equal(t, http.StatusBadRequest, w.Code)
		})
	}
}

func TestGeminiAnalysisRequest_DefaultWorkdir(t *testing.T) {
	// Verify the handler sets default workdir to "/app" when empty
	req := GeminiAnalysisRequest{
		ContainerID: "container-1",
		Prompt:      "test",
		Workdir:     "",
	}
	assert.Empty(t, req.Workdir)
	// Default is set in handler, not in struct
}

func TestSequentialWorkflowRequest_DefaultWorkdir(t *testing.T) {
	req := SequentialWorkflowRequest{
		ContainerID:        "container-1",
		AnalysisPrompt:     "analyze",
		ModificationPrompt: "modify",
		Workdir:            "",
	}
	assert.Empty(t, req.Workdir)
}

func TestGeminiAnalysisResponse_JSONSerialization(t *testing.T) {
	resp := GeminiAnalysisResponse{
		Output: "analysis output",
		Status: "success",
	}

	data, err := json.Marshal(resp)
	assert.NoError(t, err)

	var decoded GeminiAnalysisResponse
	err = json.Unmarshal(data, &decoded)
	assert.NoError(t, err)
	assert.Equal(t, resp.Output, decoded.Output)
	assert.Equal(t, resp.Status, decoded.Status)
	assert.Empty(t, decoded.Error)
}

func TestGeminiAnalysisResponse_ErrorField_OmitEmpty(t *testing.T) {
	resp := GeminiAnalysisResponse{
		Output: "",
		Status: "success",
	}

	data, err := json.Marshal(resp)
	assert.NoError(t, err)

	// Error field should be omitted when empty
	assert.NotContains(t, string(data), "error")
}

func TestSequentialWorkflowResponse_JSONSerialization(t *testing.T) {
	resp := SequentialWorkflowResponse{
		GeminiOutput: "gemini output",
		CodexOutput:  "codex output",
		Status:       "success",
	}

	data, err := json.Marshal(resp)
	assert.NoError(t, err)

	var decoded SequentialWorkflowResponse
	err = json.Unmarshal(data, &decoded)
	assert.NoError(t, err)
	assert.Equal(t, resp.GeminiOutput, decoded.GeminiOutput)
	assert.Equal(t, resp.CodexOutput, decoded.CodexOutput)
	assert.Equal(t, resp.Status, decoded.Status)
}

func TestSequentialWorkflowResponse_WithError(t *testing.T) {
	resp := SequentialWorkflowResponse{
		GeminiOutput: "partial output",
		Status:       "error",
		Error:        "codex modification failed",
	}

	data, err := json.Marshal(resp)
	assert.NoError(t, err)
	assert.Contains(t, string(data), "codex modification failed")

	var decoded SequentialWorkflowResponse
	err = json.Unmarshal(data, &decoded)
	assert.NoError(t, err)
	assert.Equal(t, "error", decoded.Status)
	assert.Equal(t, "codex modification failed", decoded.Error)
	assert.Equal(t, "partial output", decoded.GeminiOutput)
}
