import * as vscode from 'vscode';
import { WebSocketClient, MonitoringConfig } from '../services/websocketClient';

export class SettingsPanelProvider {
  private _panel?: vscode.WebviewPanel;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _wsClient: WebSocketClient
  ) {}

  public show() {
    if (this._panel) {
      this._panel.reveal();
      return;
    }

    this._panel = vscode.window.createWebviewPanel(
      'ptyAutomation.settings',
      'PTY Automation Settings',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [this._extensionUri],
      }
    );

    this._panel.webview.html = this._getHtmlForWebview();

    this._panel.webview.onDidReceiveMessage((message) => {
      this.handleMessage(message);
    });

    this._panel.onDidDispose(() => {
      this._panel = undefined;
    });

    // Send current status
    const status = this._wsClient.getCachedStatus();
    if (status) {
      this._panel.webview.postMessage({ type: 'updateStatus', status });
    }
  }

  private handleMessage(message: { type: string; config?: Partial<MonitoringConfig> }) {
    switch (message.type) {
      case 'saveConfig':
        if (message.config) {
          this._wsClient.updateConfig(message.config);
          vscode.window.showInformationMessage('Settings saved');
        }
        break;
      case 'getConfig':
        const status = this._wsClient.getCachedStatus();
        if (status && this._panel) {
          this._panel.webview.postMessage({ type: 'updateStatus', status });
        }
        break;
    }
  }

  private _getHtmlForWebview(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PTY Automation Settings</title>
  <style>
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
      padding: 20px;
      margin: 0;
    }
    h2 {
      border-bottom: 1px solid var(--vscode-panel-border);
      padding-bottom: 10px;
    }
    .section {
      margin-bottom: 20px;
    }
    .section h3 {
      margin-bottom: 10px;
    }
    .form-group {
      margin-bottom: 15px;
    }
    .form-group label {
      display: block;
      margin-bottom: 5px;
      font-weight: bold;
    }
    .form-group input, .form-group select, .form-group textarea {
      width: 100%;
      padding: 8px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border);
      border-radius: 3px;
      box-sizing: border-box;
    }
    .form-group textarea {
      min-height: 80px;
      resize: vertical;
    }
    .form-group .hint {
      font-size: 0.85em;
      color: var(--vscode-descriptionForeground);
      margin-top: 3px;
    }
    .row {
      display: flex;
      gap: 15px;
    }
    .row .form-group {
      flex: 1;
    }
    .actions {
      margin-top: 20px;
      display: flex;
      gap: 10px;
    }
    button {
      padding: 8px 16px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 3px;
      cursor: pointer;
    }
    button:hover {
      background: var(--vscode-button-hoverBackground);
    }
    button.secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
  </style>
</head>
<body>
  <h2>PTY Automation Settings</h2>

  <div class="section">
    <h3>General</h3>
    <div class="form-group">
      <label>Silence Threshold (seconds)</label>
      <input type="number" id="silenceThreshold" min="5" max="300" value="30">
      <div class="hint">Trigger strategy after this many seconds of silence (5-300)</div>
    </div>
    <div class="form-group">
      <label>Active Strategy</label>
      <select id="activeStrategy">
        <option value="webhook">Webhook</option>
        <option value="injection">Injection</option>
        <option value="queue">Queue</option>
        <option value="ai">AI</option>
      </select>
    </div>
  </div>

  <div class="section">
    <h3>Webhook Settings</h3>
    <div class="form-group">
      <label>Webhook URL</label>
      <input type="url" id="webhookUrl" placeholder="https://example.com/webhook">
    </div>
  </div>

  <div class="section">
    <h3>Injection Settings</h3>
    <div class="form-group">
      <label>Injection Command</label>
      <input type="text" id="injectionCommand" placeholder="echo 'continue'">
      <div class="hint">Supports placeholders: {container_id}, {session_id}, {timestamp}, {context}</div>
    </div>
  </div>

  <div class="section">
    <h3>Queue Settings</h3>
    <div class="form-group">
      <label>User Prompt Template</label>
      <textarea id="userPromptTemplate" placeholder="请继续执行以下任务:"></textarea>
    </div>
  </div>

  <div class="section">
    <h3>AI Settings</h3>
    <div class="row">
      <div class="form-group">
        <label>API Endpoint</label>
        <input type="url" id="aiEndpoint" placeholder="https://api.openai.com/v1">
      </div>
      <div class="form-group">
        <label>Model</label>
        <input type="text" id="aiModel" placeholder="gpt-4">
      </div>
    </div>
  </div>

  <div class="actions">
    <button onclick="saveConfig()">Save Settings</button>
    <button class="secondary" onclick="resetConfig()">Reset</button>
  </div>

  <script>
    const vscode = acquireVsCodeApi();

    function getConfig() {
      return {
        silenceThreshold: parseInt(document.getElementById('silenceThreshold').value) || 30,
        activeStrategy: document.getElementById('activeStrategy').value,
        webhookUrl: document.getElementById('webhookUrl').value,
        injectionCommand: document.getElementById('injectionCommand').value,
        userPromptTemplate: document.getElementById('userPromptTemplate').value,
        aiEndpoint: document.getElementById('aiEndpoint').value,
        aiModel: document.getElementById('aiModel').value,
      };
    }

    function setConfig(config) {
      if (config.silenceThreshold) document.getElementById('silenceThreshold').value = config.silenceThreshold;
      if (config.activeStrategy) document.getElementById('activeStrategy').value = config.activeStrategy;
      if (config.webhookUrl) document.getElementById('webhookUrl').value = config.webhookUrl;
      if (config.injectionCommand) document.getElementById('injectionCommand').value = config.injectionCommand;
      if (config.userPromptTemplate) document.getElementById('userPromptTemplate').value = config.userPromptTemplate;
      if (config.aiEndpoint) document.getElementById('aiEndpoint').value = config.aiEndpoint;
      if (config.aiModel) document.getElementById('aiModel').value = config.aiModel;
    }

    function saveConfig() {
      const config = getConfig();
      vscode.postMessage({ type: 'saveConfig', config });
    }

    function resetConfig() {
      setConfig({
        silenceThreshold: 30,
        activeStrategy: 'webhook',
        webhookUrl: '',
        injectionCommand: '',
        userPromptTemplate: '请继续执行以下任务:',
        aiEndpoint: '',
        aiModel: 'gpt-4',
      });
    }

    window.addEventListener('message', event => {
      const message = event.data;
      if (message.type === 'updateStatus') {
        setConfig({
          silenceThreshold: message.status.threshold,
          activeStrategy: message.status.strategy,
        });
      }
    });

    // Request current config on load
    vscode.postMessage({ type: 'getConfig' });
  </script>
</body>
</html>`;
  }
}
