import * as vscode from 'vscode';
import { StatusBarManager } from './statusBar';
import { WebSocketClient } from './services/websocketClient';
import { ContainerDetector } from './utils/containerDetector';
import { registerCommands } from './commands';
import { TaskPanelProvider } from './webview/taskPanel';
import { SettingsPanelProvider } from './webview/settingsPanel';

let statusBarManager: StatusBarManager;
let wsClient: WebSocketClient;
let containerDetector: ContainerDetector;

export function activate(context: vscode.ExtensionContext) {
  console.log('PTY Automation Monitor is now active');

  // Initialize container detector
  containerDetector = new ContainerDetector();
  const containerId = containerDetector.detectContainerId();

  // Initialize WebSocket client
  const config = vscode.workspace.getConfiguration('ptyAutomation');
  const serverUrl = config.get<string>('serverUrl', 'http://localhost:8080');
  wsClient = new WebSocketClient(serverUrl, containerId);

  // Initialize status bar
  statusBarManager = new StatusBarManager(wsClient);
  context.subscriptions.push(statusBarManager);

  // Initialize webview providers
  const taskPanelProvider = new TaskPanelProvider(context.extensionUri, wsClient);
  const settingsPanelProvider = new SettingsPanelProvider(context.extensionUri, wsClient);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('ptyAutomation.taskPanel', taskPanelProvider)
  );

  // Register commands
  registerCommands(context, wsClient, statusBarManager, taskPanelProvider, settingsPanelProvider);

  // Auto-connect if enabled
  if (config.get<boolean>('autoConnect', true) && containerId) {
    wsClient.connect();
  }

  // Listen for configuration changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('ptyAutomation')) {
        const newConfig = vscode.workspace.getConfiguration('ptyAutomation');
        const newServerUrl = newConfig.get<string>('serverUrl', 'http://localhost:8080');
        if (newServerUrl !== wsClient.serverUrl) {
          wsClient.updateServerUrl(newServerUrl);
        }
        statusBarManager.updateVisibility(newConfig.get<boolean>('showStatusBar', true));
      }
    })
  );

  // Cleanup on deactivation
  context.subscriptions.push({
    dispose: () => {
      wsClient.disconnect();
    },
  });
}

export function deactivate() {
  if (wsClient) {
    wsClient.disconnect();
  }
}
