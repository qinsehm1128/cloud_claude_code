import * as vscode from 'vscode';
import { WebSocketClient, MonitoringStatus } from './services/websocketClient';

export class StatusBarManager implements vscode.Disposable {
  private statusBarItem: vscode.StatusBarItem;
  private wsClient: WebSocketClient;
  private currentStatus: MonitoringStatus | null = null;
  private timerInterval: NodeJS.Timeout | null = null;
  private visible: boolean = true;

  constructor(wsClient: WebSocketClient) {
    this.wsClient = wsClient;
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    this.statusBarItem.command = 'ptyAutomation.toggleMonitoring';
    this.statusBarItem.tooltip = 'Click to toggle PTY monitoring';

    // Subscribe to status updates
    this.wsClient.onStatusUpdate((status) => {
      this.currentStatus = status;
      this.updateDisplay();
    });

    // Subscribe to connection state
    this.wsClient.onConnectionChange((connected) => {
      if (!connected) {
        this.showDisconnected();
      }
    });

    // Initial display
    this.showDisconnected();
    this.show();

    // Start timer update interval
    this.startTimerInterval();
  }

  private startTimerInterval() {
    this.timerInterval = setInterval(() => {
      if (this.currentStatus?.enabled) {
        this.updateDisplay();
      }
    }, 1000);
  }

  private updateDisplay() {
    if (!this.currentStatus) {
      this.showDisconnected();
      return;
    }

    const { enabled, silenceDuration, threshold, strategy, queueSize } = this.currentStatus;

    if (!enabled) {
      this.statusBarItem.text = '$(circle-slash) PTY Off';
      this.statusBarItem.backgroundColor = undefined;
      this.statusBarItem.color = new vscode.ThemeColor('statusBarItem.warningForeground');
      return;
    }

    // Calculate remaining time
    const remaining = Math.max(0, threshold - silenceDuration);
    const percentage = (silenceDuration / threshold) * 100;

    // Choose icon based on status
    let icon = '$(pulse)';
    let bgColor: vscode.ThemeColor | undefined;

    if (percentage >= 90) {
      icon = '$(warning)';
      bgColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    } else if (percentage >= 70) {
      icon = '$(clock)';
      bgColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    }

    // Format strategy display
    const strategyLabel = this.getStrategyLabel(strategy);
    const queueInfo = strategy === 'queue' && queueSize > 0 ? ` [${queueSize}]` : '';

    this.statusBarItem.text = `${icon} ${remaining}s | ${strategyLabel}${queueInfo}`;
    this.statusBarItem.backgroundColor = bgColor;
    this.statusBarItem.color = undefined;
  }

  private getStrategyLabel(strategy: string): string {
    const labels: Record<string, string> = {
      webhook: 'WH',
      injection: 'INJ',
      queue: 'Q',
      ai: 'AI',
    };
    return labels[strategy] || strategy.toUpperCase();
  }

  private showDisconnected() {
    this.statusBarItem.text = '$(debug-disconnect) PTY Disconnected';
    this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    this.statusBarItem.color = undefined;
  }

  public show() {
    if (this.visible) {
      this.statusBarItem.show();
    }
  }

  public hide() {
    this.statusBarItem.hide();
  }

  public updateVisibility(visible: boolean) {
    this.visible = visible;
    if (visible) {
      this.show();
    } else {
      this.hide();
    }
  }

  public getStatus(): MonitoringStatus | null {
    return this.currentStatus;
  }

  dispose() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }
    this.statusBarItem.dispose();
  }
}
