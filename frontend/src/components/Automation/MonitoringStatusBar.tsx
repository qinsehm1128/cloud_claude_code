import { useState } from 'react';
import { Play, Pause, Settings, ChevronDown, ChevronUp, Clock, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export interface MonitoringStatus {
  enabled: boolean;
  silenceDuration: number;
  threshold: number;
  strategy: string;
  queueSize: number;
  currentTask?: {
    id: number;
    text: string;
    status: string;
  };
  lastAction?: {
    strategy: string;
    action: string;
    timestamp: string;
    success: boolean;
  };
}

interface MonitoringStatusBarProps {
  status: MonitoringStatus;
  onToggle: () => void;
  onOpenSettings: () => void;
  className?: string;
}

const strategyLabels: Record<string, string> = {
  webhook: 'Webhook',
  injection: 'Command Injection',
  queue: 'Task Queue',
  ai: 'AI Decision',
};

const strategyColors: Record<string, string> = {
  webhook: 'bg-blue-500',
  injection: 'bg-green-500',
  queue: 'bg-purple-500',
  ai: 'bg-orange-500',
};

export function MonitoringStatusBar({
  status,
  onToggle,
  onOpenSettings,
  className,
}: MonitoringStatusBarProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  const progressPercent = status.enabled
    ? Math.min((status.silenceDuration / status.threshold) * 100, 100)
    : 0;

  return (
    <div
      className={cn(
        'border-t bg-background transition-all duration-200',
        className
      )}
    >
      {/* Main status bar */}
      <div className="flex items-center justify-between px-4 py-2">
        <div className="flex items-center gap-4">
          {/* Toggle button */}
          <Button
            variant={status.enabled ? 'default' : 'outline'}
            size="sm"
            onClick={onToggle}
            className="gap-2"
          >
            {status.enabled ? (
              <>
                <Pause className="h-4 w-4" />
                Monitoring
              </>
            ) : (
              <>
                <Play className="h-4 w-4" />
                Enable Monitoring
              </>
            )}
          </Button>

          {/* Strategy badge */}
          <Badge
            variant="secondary"
            className={cn(
              'gap-1',
              status.enabled && strategyColors[status.strategy]
            )}
          >
            <Zap className="h-3 w-3" />
            {strategyLabels[status.strategy] || status.strategy}
          </Badge>

          {/* Timer display */}
          {status.enabled && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span>
                {formatTime(status.silenceDuration)} / {formatTime(status.threshold)}
              </span>
              {/* Progress bar */}
              <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className={cn(
                    'h-full transition-all duration-1000',
                    progressPercent >= 80 ? 'bg-red-500' : 
                    progressPercent >= 50 ? 'bg-yellow-500' : 'bg-green-500'
                  )}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          )}

          {/* Queue size */}
          {status.strategy === 'queue' && status.queueSize > 0 && (
            <Badge variant="outline">
              Queue: {status.queueSize}
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Settings button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={onOpenSettings}
          >
            <Settings className="h-4 w-4" />
          </Button>

          {/* Expand/collapse button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronUp className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      {/* Expanded details */}
      {isExpanded && (
        <div className="px-4 py-2 border-t bg-muted/50 text-sm">
          <div className="grid grid-cols-2 gap-4">
            {/* Current task */}
            {status.currentTask && (
              <div>
                <span className="text-muted-foreground">Current Task:</span>
                <p className="truncate">{status.currentTask.text}</p>
              </div>
            )}

            {/* Last action */}
            {status.lastAction && (
              <div>
                <span className="text-muted-foreground">Last Action:</span>
                <p>
                  {status.lastAction.action}
                  {status.lastAction.success ? (
                    <Badge variant="outline" className="ml-2 text-green-500">Success</Badge>
                  ) : (
                    <Badge variant="outline" className="ml-2 text-red-500">Failed</Badge>
                  )}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default MonitoringStatusBar;
