import { cn } from '@/lib/utils';

interface StatusIndicatorProps {
  className?: string;
}

// 后端会话运行状态指示器 - 方形
export function BackendStatusIndicator({ 
  isRunning, 
  className 
}: StatusIndicatorProps & { isRunning: boolean }) {
  return (
    <svg 
      width="12" 
      height="12" 
      viewBox="0 0 12 12" 
      className={cn("flex-shrink-0", className)}
    >
      {isRunning ? (
        // 运行中 - 红色闪烁方块
        <>
          <rect 
            x="1" 
            y="1" 
            width="10" 
            height="10" 
            rx="2" 
            fill="#ef4444" 
            className="animate-pulse"
          />
          <rect 
            x="3" 
            y="3" 
            width="6" 
            height="6" 
            rx="1" 
            fill="#fca5a5"
          />
        </>
      ) : (
        // 已停止 - 灰色方块
        <>
          <rect 
            x="1" 
            y="1" 
            width="10" 
            height="10" 
            rx="2" 
            fill="#6b7280" 
            fillOpacity="0.3"
          />
          <rect 
            x="1" 
            y="1" 
            width="10" 
            height="10" 
            rx="2" 
            stroke="#6b7280" 
            strokeWidth="1" 
            fill="none"
          />
        </>
      )}
    </svg>
  );
}

// WebSocket 连接状态指示器 - 信号图标
export function WebSocketStatusIndicator({ 
  isConnected, 
  className 
}: StatusIndicatorProps & { isConnected: boolean }) {
  return (
    <svg 
      width="14" 
      height="14" 
      viewBox="0 0 14 14" 
      className={cn("flex-shrink-0", className)}
    >
      {isConnected ? (
        // 已连接 - 蓝色信号图标
        <>
          {/* 信号波 */}
          <path 
            d="M7 11 L7 5" 
            stroke="#3b82f6" 
            strokeWidth="2" 
            strokeLinecap="round"
          />
          <path 
            d="M4 9 L4 5" 
            stroke="#3b82f6" 
            strokeWidth="2" 
            strokeLinecap="round"
            opacity="0.7"
          />
          <path 
            d="M10 9 L10 5" 
            stroke="#3b82f6" 
            strokeWidth="2" 
            strokeLinecap="round"
            opacity="0.7"
          />
          <path 
            d="M1 7 L1 5" 
            stroke="#3b82f6" 
            strokeWidth="2" 
            strokeLinecap="round"
            opacity="0.4"
          />
          <path 
            d="M13 7 L13 5" 
            stroke="#3b82f6" 
            strokeWidth="2" 
            strokeLinecap="round"
            opacity="0.4"
          />
          {/* 底部点 */}
          <circle cx="7" cy="12" r="1.5" fill="#3b82f6" />
        </>
      ) : (
        // 未连接 - 灰色断开图标
        <>
          <path 
            d="M7 11 L7 5" 
            stroke="#6b7280" 
            strokeWidth="2" 
            strokeLinecap="round"
            opacity="0.3"
          />
          <path 
            d="M4 9 L4 5" 
            stroke="#6b7280" 
            strokeWidth="2" 
            strokeLinecap="round"
            opacity="0.2"
          />
          <path 
            d="M10 9 L10 5" 
            stroke="#6b7280" 
            strokeWidth="2" 
            strokeLinecap="round"
            opacity="0.2"
          />
          {/* 断开线 */}
          <path 
            d="M2 2 L12 12" 
            stroke="#ef4444" 
            strokeWidth="1.5" 
            strokeLinecap="round"
            opacity="0.6"
          />
          <circle cx="7" cy="12" r="1.5" fill="#6b7280" opacity="0.3" />
        </>
      )}
    </svg>
  );
}

// 组合状态指示器 - 同时显示后端和 WS 状态
export function CombinedStatusIndicator({
  isBackendRunning,
  isWsConnected,
  className,
}: StatusIndicatorProps & { isBackendRunning: boolean; isWsConnected: boolean }) {
  return (
    <div className={cn("flex items-center gap-1", className)}>
      <BackendStatusIndicator isRunning={isBackendRunning} />
      <WebSocketStatusIndicator isConnected={isWsConnected} />
    </div>
  );
}

// 带标签的状态指示器
export function LabeledStatusIndicator({
  isBackendRunning,
  isWsConnected,
  showLabels = false,
  className,
}: StatusIndicatorProps & { 
  isBackendRunning: boolean; 
  isWsConnected: boolean;
  showLabels?: boolean;
}) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="flex items-center gap-1">
        <BackendStatusIndicator isRunning={isBackendRunning} />
        {showLabels && (
          <span className={cn(
            "text-xs",
            isBackendRunning ? "text-red-500" : "text-muted-foreground"
          )}>
            {isBackendRunning ? 'Running' : 'Stopped'}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1">
        <WebSocketStatusIndicator isConnected={isWsConnected} />
        {showLabels && (
          <span className={cn(
            "text-xs",
            isWsConnected ? "text-blue-500" : "text-muted-foreground"
          )}>
            {isWsConnected ? 'Connected' : 'Disconnected'}
          </span>
        )}
      </div>
    </div>
  );
}

export default {
  BackendStatusIndicator,
  WebSocketStatusIndicator,
  CombinedStatusIndicator,
  LabeledStatusIndicator,
};
