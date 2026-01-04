import * as vscode from 'vscode';
import { WebSocketClient, Task } from '../services/websocketClient';

export class TaskPanelProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'ptyAutomation.taskPanel';
  private _view?: vscode.WebviewView;
  private _panel?: vscode.WebviewPanel;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _wsClient: WebSocketClient
  ) {
    // Subscribe to task updates
    this._wsClient.onTasksUpdate((tasks) => {
      this.updateTasks(tasks);
    });
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    // Handle messages from webview
    webviewView.webview.onDidReceiveMessage((message) => {
      this.handleMessage(message);
    });

    // Send initial tasks
    const tasks = this._wsClient.getCachedTasks();
    if (tasks.length > 0) {
      this.updateTasks(tasks);
    }
  }

  public show() {
    if (this._panel) {
      this._panel.reveal();
      return;
    }

    this._panel = vscode.window.createWebviewPanel(
      'ptyAutomation.taskPanel',
      'PTY Task Queue',
      vscode.ViewColumn.Two,
      {
        enableScripts: true,
        localResourceRoots: [this._extensionUri],
      }
    );

    this._panel.webview.html = this._getHtmlForWebview(this._panel.webview);

    this._panel.webview.onDidReceiveMessage((message) => {
      this.handleMessage(message);
    });

    this._panel.onDidDispose(() => {
      this._panel = undefined;
    });

    // Send initial tasks
    const tasks = this._wsClient.getCachedTasks();
    if (tasks.length > 0) {
      this._panel.webview.postMessage({ type: 'updateTasks', tasks });
    }
  }

  private handleMessage(message: { type: string; [key: string]: unknown }) {
    switch (message.type) {
      case 'addTask':
        this._wsClient.addTask(message.text as string, message.priority as number);
        break;
      case 'removeTask':
        this._wsClient.removeTask(message.taskId as number);
        break;
      case 'reorderTasks':
        this._wsClient.reorderTasks(message.taskIds as number[]);
        break;
      case 'clearTasks':
        this._wsClient.clearTasks();
        break;
    }
  }

  private updateTasks(tasks: Task[]) {
    if (this._view) {
      this._view.webview.postMessage({ type: 'updateTasks', tasks });
    }
    if (this._panel) {
      this._panel.webview.postMessage({ type: 'updateTasks', tasks });
    }
  }

  private _getHtmlForWebview(_webview: vscode.Webview): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PTY Task Queue</title>
  <style>
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
      padding: 10px;
      margin: 0;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
    }
    .header h3 {
      margin: 0;
    }
    .add-form {
      display: flex;
      gap: 5px;
      margin-bottom: 10px;
    }
    .add-form input {
      flex: 1;
      padding: 5px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border);
      border-radius: 3px;
    }
    .add-form button, .header button {
      padding: 5px 10px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 3px;
      cursor: pointer;
    }
    .add-form button:hover, .header button:hover {
      background: var(--vscode-button-hoverBackground);
    }
    .task-list {
      list-style: none;
      padding: 0;
      margin: 0;
    }
    .task-item {
      display: flex;
      align-items: center;
      padding: 8px;
      margin-bottom: 5px;
      background: var(--vscode-list-hoverBackground);
      border-radius: 3px;
      cursor: grab;
    }
    .task-item.dragging {
      opacity: 0.5;
    }
    .task-item .handle {
      margin-right: 8px;
      cursor: grab;
      color: var(--vscode-descriptionForeground);
    }
    .task-item .text {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .task-item .status {
      font-size: 0.8em;
      padding: 2px 6px;
      border-radius: 3px;
      margin-left: 8px;
    }
    .task-item .status.pending {
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
    }
    .task-item .status.running {
      background: var(--vscode-progressBar-background);
      color: white;
    }
    .task-item .delete {
      margin-left: 8px;
      background: transparent;
      border: none;
      color: var(--vscode-errorForeground);
      cursor: pointer;
      padding: 2px 6px;
    }
    .empty {
      text-align: center;
      color: var(--vscode-descriptionForeground);
      padding: 20px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h3>Task Queue</h3>
    <button onclick="clearTasks()">Clear All</button>
  </div>
  <div class="add-form">
    <input type="text" id="taskInput" placeholder="Enter task..." onkeypress="handleKeyPress(event)">
    <button onclick="addTask()">Add</button>
  </div>
  <ul class="task-list" id="taskList"></ul>

  <script>
    const vscode = acquireVsCodeApi();
    let tasks = [];

    function renderTasks() {
      const list = document.getElementById('taskList');
      if (tasks.length === 0) {
        list.innerHTML = '<li class="empty">No tasks in queue</li>';
        return;
      }
      list.innerHTML = tasks.map((task, index) => \`
        <li class="task-item" draggable="true" data-id="\${task.id}" data-index="\${index}">
          <span class="handle">☰</span>
          <span class="text">\${escapeHtml(task.text)}</span>
          <span class="status \${task.status}">\${task.status}</span>
          <button class="delete" onclick="removeTask(\${task.id})">×</button>
        </li>
      \`).join('');
      setupDragAndDrop();
    }

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    function addTask() {
      const input = document.getElementById('taskInput');
      const text = input.value.trim();
      if (text) {
        vscode.postMessage({ type: 'addTask', text });
        input.value = '';
      }
    }

    function removeTask(taskId) {
      vscode.postMessage({ type: 'removeTask', taskId });
    }

    function clearTasks() {
      vscode.postMessage({ type: 'clearTasks' });
    }

    function handleKeyPress(event) {
      if (event.key === 'Enter') {
        addTask();
      }
    }

    function setupDragAndDrop() {
      const items = document.querySelectorAll('.task-item');
      items.forEach(item => {
        item.addEventListener('dragstart', handleDragStart);
        item.addEventListener('dragover', handleDragOver);
        item.addEventListener('drop', handleDrop);
        item.addEventListener('dragend', handleDragEnd);
      });
    }

    let draggedItem = null;

    function handleDragStart(e) {
      draggedItem = this;
      this.classList.add('dragging');
    }

    function handleDragOver(e) {
      e.preventDefault();
    }

    function handleDrop(e) {
      e.preventDefault();
      if (draggedItem !== this) {
        const fromIndex = parseInt(draggedItem.dataset.index);
        const toIndex = parseInt(this.dataset.index);
        const newOrder = [...tasks];
        const [removed] = newOrder.splice(fromIndex, 1);
        newOrder.splice(toIndex, 0, removed);
        vscode.postMessage({ type: 'reorderTasks', taskIds: newOrder.map(t => t.id) });
      }
    }

    function handleDragEnd() {
      this.classList.remove('dragging');
      draggedItem = null;
    }

    window.addEventListener('message', event => {
      const message = event.data;
      if (message.type === 'updateTasks') {
        tasks = message.tasks;
        renderTasks();
      }
    });

    renderTasks();
  </script>
</body>
</html>`;
  }
}
