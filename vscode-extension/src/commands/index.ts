import * as vscode from 'vscode';
import { WebSocketClient } from '../services/websocketClient';
import { StatusBarManager } from '../statusBar';
import { TaskPanelProvider } from '../webview/taskPanel';
import { SettingsPanelProvider } from '../webview/settingsPanel';

export function registerCommands(
  context: vscode.ExtensionContext,
  wsClient: WebSocketClient,
  statusBarManager: StatusBarManager,
  taskPanelProvider: TaskPanelProvider,
  settingsPanelProvider: SettingsPanelProvider
) {
  // Toggle monitoring command
  context.subscriptions.push(
    vscode.commands.registerCommand('ptyAutomation.toggleMonitoring', async () => {
      if (!wsClient.isConnected()) {
        const action = await vscode.window.showWarningMessage(
          'Not connected to PTY server. Connect now?',
          'Connect',
          'Cancel'
        );
        if (action === 'Connect') {
          wsClient.connect();
        }
        return;
      }

      await wsClient.toggleMonitoring();
      const status = statusBarManager.getStatus();
      const newState = status?.enabled ? 'disabled' : 'enabled';
      vscode.window.showInformationMessage(`PTY monitoring ${newState}`);
    })
  );

  // Open task panel command
  context.subscriptions.push(
    vscode.commands.registerCommand('ptyAutomation.openTaskPanel', () => {
      taskPanelProvider.show();
    })
  );

  // Open settings command
  context.subscriptions.push(
    vscode.commands.registerCommand('ptyAutomation.openSettings', () => {
      settingsPanelProvider.show();
    })
  );

  // Change strategy command
  context.subscriptions.push(
    vscode.commands.registerCommand('ptyAutomation.changeStrategy', async () => {
      const strategies = [
        { label: 'Webhook', value: 'webhook', description: 'Send HTTP notification' },
        { label: 'Injection', value: 'injection', description: 'Inject command into PTY' },
        { label: 'Queue', value: 'queue', description: 'Execute next task from queue' },
        { label: 'AI', value: 'ai', description: 'Let AI decide the action' },
      ];

      const selected = await vscode.window.showQuickPick(strategies, {
        placeHolder: 'Select automation strategy',
        title: 'Change PTY Automation Strategy',
      });

      if (selected) {
        await wsClient.updateConfig({ activeStrategy: selected.value });
        vscode.window.showInformationMessage(`Strategy changed to ${selected.label}`);
      }
    })
  );

  // Reconnect command
  context.subscriptions.push(
    vscode.commands.registerCommand('ptyAutomation.reconnect', () => {
      wsClient.disconnect();
      wsClient.connect();
      vscode.window.showInformationMessage('Reconnecting to PTY server...');
    })
  );

  // Add task command
  context.subscriptions.push(
    vscode.commands.registerCommand('ptyAutomation.addTask', async () => {
      const text = await vscode.window.showInputBox({
        prompt: 'Enter task description',
        placeHolder: 'Task to execute when triggered',
      });

      if (text) {
        await wsClient.addTask(text);
        vscode.window.showInformationMessage('Task added to queue');
      }
    })
  );

  // Clear tasks command
  context.subscriptions.push(
    vscode.commands.registerCommand('ptyAutomation.clearTasks', async () => {
      const confirm = await vscode.window.showWarningMessage(
        'Clear all tasks from the queue?',
        'Yes',
        'No'
      );

      if (confirm === 'Yes') {
        await wsClient.clearTasks();
        vscode.window.showInformationMessage('Task queue cleared');
      }
    })
  );
}
