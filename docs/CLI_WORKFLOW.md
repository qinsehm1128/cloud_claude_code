# CLI Workflow Guide

## Overview

The CLI workflow feature integrates Gemini (analysis) and Codex (modification) tools for AI-assisted code operations inside Docker containers. Two workflow modes are available:

- **Analysis Only** - Run Gemini to analyze code and receive insights
- **Sequential Workflow** - Run Gemini analysis, then automatically pass results to Codex for code modifications

## Gemini Analysis

### Step-by-step

1. Open a container terminal
2. Click the **Analyze Code** button (sparkle icon) in the terminal toolbar
3. A modal dialog opens with the following fields:
   - **Analysis Prompt** (required, min 10 chars) - Describe what to analyze
   - **Working Directory** - Defaults to `/app`
4. Click **Analyze** to start
5. Results appear in the CLI Workflow Results panel below the terminal

### Example Prompt

```
Analyze the authentication module for security vulnerabilities,
focusing on SQL injection and XSS attack vectors
```

### How It Works

The analysis prompt is sent to the Gemini CLI tool running inside the container via:

```
ccw cli -p '<prompt>' --tool gemini --mode analysis --cd '<workdir>'
```

## Sequential Workflow (Gemini + Codex)

### Step-by-step

1. Open a container terminal
2. Click the **Auto-fix Issues** button (wand icon) in the terminal toolbar
3. A modal dialog opens with:
   - **Analysis Prompt** (required) - What to analyze
   - **Modification Prompt** (required) - What code changes to make
   - **Working Directory** - Defaults to `/app`
4. Click **Run Workflow** to start
5. The workflow executes in two stages:
   - Stage 1: Gemini analyzes the code, output saved to a temp file
   - Stage 2: Codex receives the modification prompt with Gemini's analysis as context
6. Both outputs appear in the results panel (Analysis Results + Modifications)

### Example

**Analysis Prompt:**
```
Find all functions that handle user input without proper validation
```

**Modification Prompt:**
```
Add input validation and sanitization to all identified functions.
Use parameterized queries for database operations.
```

### Result Passing

The sequential workflow automatically:
1. Saves Gemini's output to `/tmp/gemini-analysis-<uuid>.json` inside the container
2. Passes this file path to Codex as context: `ccw cli -p '<prompt> Context: @/tmp/gemini-analysis-<uuid>.json' --tool codex --mode write`
3. Cleans up the temp file after completion

## Results Panel

The CLI Workflow Results panel shows:

- **Loading state** - Spinner with "Processing workflow..." message
- **Analysis Results** (yellow sparkle icon) - Gemini's analysis output, collapsible
- **Modifications** (blue edit icon) - Codex's modification output, collapsible
- **Copy button** - Copy any section's output to clipboard
- **Close button** - Dismiss the results panel

## Best Practices

1. **Be specific in prompts** - Include file paths, function names, or patterns to focus the analysis
2. **Limit scope** - Use the working directory to narrow the analysis area
3. **Review before applying** - Always review Codex modifications before accepting
4. **Incremental changes** - Prefer small, focused modifications over large sweeping changes
5. **Use analysis first** - Run analysis-only mode to understand the codebase before requesting modifications
