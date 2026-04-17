# Troubleshooting

## Mobile Terminal

### Auxiliary keyboard not appearing

**Symptom**: No preset command buttons below the terminal on a mobile device.

**Solutions**:
- Verify viewport width is <= 768px (the keyboard only shows on mobile viewports)
- Check that the container terminal page loaded fully
- Try refreshing the page
- Ensure JavaScript is enabled in the mobile browser

### Preset commands not executing

**Symptom**: Tapping a button does nothing in the terminal.

**Solutions**:
- Check the WebSocket connection is active (the terminal should show a cursor)
- Verify the PTY session is alive (try typing directly in the terminal)
- Reconnect to the terminal if the WebSocket dropped
- Check browser console for WebSocket errors

### Terminal scroll not working

**Symptom**: Up/Down scroll buttons don't move terminal content.

**Solutions**:
- Ensure there is enough terminal history to scroll (content must exceed the viewport)
- Verify the terminal instance is initialized (wait for the prompt to appear)
- If web page scrolling interferes, use the dedicated scroll buttons instead of touch gestures

### Touch targets too small

**Symptom**: Difficulty tapping the correct button on mobile.

**Solutions**:
- All buttons have a minimum touch target of 44px; if they appear smaller, check CSS overrides
- Try landscape orientation for more space
- Zoom in on the keyboard area if needed

## CLI Workflows

### Workflow timeout

**Symptom**: The loading spinner runs indefinitely without results.

**Solutions**:
- CLI tool execution can take several minutes for large codebases; wait at least 2-3 minutes
- Reduce the analysis scope by specifying a more targeted working directory
- Check container logs for execution progress
- Verify the container has enough resources (memory/CPU) for concurrent processes

### Gemini API errors

**Symptom**: Analysis fails with API-related error messages.

**Solutions**:
- Verify Gemini CLI is installed and configured inside the container
- Check that the API key/credentials are set in the container environment
- Ensure the container has network access for API calls
- Check rate limits if making many requests in succession

### Codex modification failed

**Symptom**: Analysis succeeds but code modification fails.

**Solutions**:
- Verify Codex CLI is installed inside the container
- Check that the working directory exists and is writable
- Ensure the Gemini analysis output was saved correctly (temp file creation)
- Review the modification prompt for clarity - vague prompts may cause failures

### Concurrent process errors

**Symptom**: Starting multiple CLI workflows fails with resource limit errors.

**Solutions**:
- Check the container's PidsLimit (default: 256 processes)
- Increase memory allocation if processes are being OOM-killed
- Run workflows sequentially instead of concurrently if resources are limited
- Check `docker stats <container>` to monitor resource usage

### Results panel not showing output

**Symptom**: Workflow completes but no results appear.

**Solutions**:
- Check if the results panel was closed manually (it won't auto-reopen)
- Verify the API response contains `gemini_output` / `codex_output` fields
- Check browser console for JSON parsing errors
- Ensure the workflow response status is "success"

### Docker exec failures

**Symptom**: Error message about failing to execute commands in container.

**Solutions**:
- Verify the container is running: `docker ps | grep <container_id>`
- Check that the container has `sh` available (required for command execution)
- Ensure the ccw CLI tool is installed in the container's PATH
- Verify Docker socket connectivity from the backend service
