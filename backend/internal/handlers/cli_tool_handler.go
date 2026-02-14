package handlers

import (
	"net/http"

	"cc-platform/internal/services"

	"github.com/gin-gonic/gin"
)

// CLIToolHandler handles CLI tool integration endpoints
type CLIToolHandler struct {
	cliToolService *services.CLIToolService
}

// NewCLIToolHandler creates a new CLIToolHandler
func NewCLIToolHandler(cliToolService *services.CLIToolService) *CLIToolHandler {
	return &CLIToolHandler{
		cliToolService: cliToolService,
	}
}

// SequentialWorkflowRequest represents a request for sequential CLI tool workflow
type SequentialWorkflowRequest struct {
	ContainerID        string `json:"container_id" binding:"required"`
	AnalysisPrompt     string `json:"analysis_prompt" binding:"required"`
	ModificationPrompt string `json:"modification_prompt" binding:"required"`
	Workdir            string `json:"workdir"`
}

// SequentialWorkflowResponse represents the response from sequential CLI tool workflow
type SequentialWorkflowResponse struct {
	GeminiOutput string `json:"gemini_output"`
	CodexOutput  string `json:"codex_output"`
	Status       string `json:"status"`
	Error        string `json:"error,omitempty"`
}

// GeminiAnalysisRequest represents a request for standalone Gemini analysis
type GeminiAnalysisRequest struct {
	ContainerID string `json:"container_id" binding:"required"`
	Prompt      string `json:"prompt" binding:"required"`
	Workdir     string `json:"workdir"`
}

// GeminiAnalysisResponse represents the response from Gemini analysis
type GeminiAnalysisResponse struct {
	Output string `json:"output"`
	Status string `json:"status"`
	Error  string `json:"error,omitempty"`
}

// HandleGeminiAnalysis handles POST /api/cli-tools/analyze
func (h *CLIToolHandler) HandleGeminiAnalysis(c *gin.Context) {
	var req GeminiAnalysisRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, GeminiAnalysisResponse{
			Status: "error",
			Error:  "invalid request: " + err.Error(),
		})
		return
	}

	if req.Workdir == "" {
		req.Workdir = "/app"
	}

	output, err := h.cliToolService.ExecuteGeminiAnalysis(
		c.Request.Context(),
		req.ContainerID,
		req.Prompt,
		req.Workdir,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, GeminiAnalysisResponse{
			Status: "error",
			Error:  err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, GeminiAnalysisResponse{
		Output: output,
		Status: "success",
	})
}

// HandleSequentialWorkflow handles POST /api/cli-tools/sequential
func (h *CLIToolHandler) HandleSequentialWorkflow(c *gin.Context) {
	var req SequentialWorkflowRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, SequentialWorkflowResponse{
			Status: "error",
			Error:  "invalid request: " + err.Error(),
		})
		return
	}

	// Default workdir
	if req.Workdir == "" {
		req.Workdir = "/app"
	}

	geminiOutput, codexOutput, err := h.cliToolService.ExecuteSequentialWorkflow(
		c.Request.Context(),
		req.ContainerID,
		req.AnalysisPrompt,
		req.ModificationPrompt,
		req.Workdir,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, SequentialWorkflowResponse{
			GeminiOutput: geminiOutput,
			Status:       "error",
			Error:        err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, SequentialWorkflowResponse{
		GeminiOutput: geminiOutput,
		CodexOutput:  codexOutput,
		Status:       "success",
	})
}
