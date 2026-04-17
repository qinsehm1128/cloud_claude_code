# API Reference

## CLI Tool Endpoints

### POST /api/cli-tools/analyze

Run standalone Gemini analysis inside a container.

#### Request

```json
{
  "container_id": "string (required)",
  "prompt": "string (required)",
  "workdir": "string (optional, default: /app)"
}
```

#### Response

```json
{
  "output": "string - Gemini analysis output",
  "status": "success | error",
  "error": "string (only present on error)"
}
```

#### Example

```bash
curl -X POST http://localhost:8080/api/cli-tools/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "container_id": "abc123",
    "prompt": "Analyze authentication module for security vulnerabilities",
    "workdir": "/app/src"
  }'
```

#### Error Responses

| Status | Condition |
|--------|-----------|
| 400    | Invalid JSON body or missing required fields |
| 500    | Gemini CLI execution failed inside the container |

---

### POST /api/cli-tools/sequential

Run sequential Gemini analysis followed by Codex code modification.

#### Request

```json
{
  "container_id": "string (required)",
  "analysis_prompt": "string (required)",
  "modification_prompt": "string (required)",
  "workdir": "string (optional, default: /app)"
}
```

#### Response

```json
{
  "gemini_output": "string - Gemini analysis output",
  "codex_output": "string - Codex modification output",
  "status": "success | error",
  "error": "string (only present on error)"
}
```

**Note**: On partial failure (Gemini succeeds but Codex fails), `gemini_output` is still returned with `status: "error"`.

#### Example

```bash
curl -X POST http://localhost:8080/api/cli-tools/sequential \
  -H "Content-Type: application/json" \
  -d '{
    "container_id": "abc123",
    "analysis_prompt": "Find functions with SQL injection vulnerabilities",
    "modification_prompt": "Fix all identified SQL injection issues using parameterized queries",
    "workdir": "/app"
  }'
```

#### Error Responses

| Status | Condition |
|--------|-----------|
| 400    | Invalid JSON body or missing required fields |
| 500    | CLI tool execution failed (Gemini or Codex stage) |

## Docker Resource Limits

Container resource limits are enforced via `DefaultSecurityConfig()`:

| Resource | Default | Max Allowed |
|----------|---------|-------------|
| Memory | 2 GB | 128 GB |
| MemorySwap | 2 GB (no swap) | - |
| CPU Quota | 100000 us (1 core) | - |
| CPU Period | 100000 us | 1000 - 1000000 |
| Pids Limit | 256 | - |

### Resource Validation Rules

- Memory: Must be >= 0 and <= 128 GB
- CPU Period: Must be between 1000 and 1000000 microseconds
- CPU Quota: Must be >= 1000 when CPU Period is set
- Zero values mean no limit (Docker defaults apply)

## WebSocket Protocol

### Keyboard Command Message

```json
{
  "type": "keyboard_command",
  "data": "<command string>"
}
```

### Scroll Message

```json
{
  "type": "scroll",
  "data": "<lines: positive=down, negative=up>"
}
```
