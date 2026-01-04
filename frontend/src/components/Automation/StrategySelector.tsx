import { Zap, Webhook, Terminal, ListTodo, Bot } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export type StrategyType = 'webhook' | 'injection' | 'queue' | 'ai';

export interface StrategyOption {
  value: StrategyType;
  label: string;
  description: string;
  icon: React.ReactNode;
  color: string;
}

const strategies: StrategyOption[] = [
  {
    value: 'webhook',
    label: 'Webhook 通知',
    description: '发送 HTTP 请求通知外部系统',
    icon: <Webhook className="h-4 w-4" />,
    color: 'bg-blue-500',
  },
  {
    value: 'injection',
    label: '命令注入',
    description: '自动向终端注入预设命令',
    icon: <Terminal className="h-4 w-4" />,
    color: 'bg-green-500',
  },
  {
    value: 'queue',
    label: '任务队列',
    description: '从任务队列获取下一个任务执行',
    icon: <ListTodo className="h-4 w-4" />,
    color: 'bg-purple-500',
  },
  {
    value: 'ai',
    label: 'AI 决策',
    description: '使用 AI 分析上下文并决定操作',
    icon: <Bot className="h-4 w-4" />,
    color: 'bg-orange-500',
  },
];

interface StrategySelectorProps {
  value: StrategyType;
  onChange: (value: StrategyType) => void;
  disabled?: boolean;
  showDescription?: boolean;
  className?: string;
}

export function StrategySelector({
  value,
  onChange,
  disabled = false,
  showDescription = false,
  className,
}: StrategySelectorProps) {
  const selectedStrategy = strategies.find((s) => s.value === value);

  return (
    <Select
      value={value}
      onValueChange={(v) => onChange(v as StrategyType)}
      disabled={disabled}
    >
      <SelectTrigger className={cn('w-full', className)}>
        <SelectValue>
          {selectedStrategy && (
            <div className="flex items-center gap-2">
              <Badge
                variant="secondary"
                className={cn('gap-1 px-1.5', selectedStrategy.color)}
              >
                {selectedStrategy.icon}
              </Badge>
              <span>{selectedStrategy.label}</span>
            </div>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {strategies.map((strategy) => (
          <SelectItem key={strategy.value} value={strategy.value}>
            <div className="flex items-center gap-2">
              <Badge
                variant="secondary"
                className={cn('gap-1 px-1.5', strategy.color)}
              >
                {strategy.icon}
              </Badge>
              <div className="flex flex-col">
                <span>{strategy.label}</span>
                {showDescription && (
                  <span className="text-xs text-muted-foreground">
                    {strategy.description}
                  </span>
                )}
              </div>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

interface StrategyBadgeProps {
  strategy: StrategyType;
  showLabel?: boolean;
  className?: string;
}

export function StrategyBadge({
  strategy,
  showLabel = true,
  className,
}: StrategyBadgeProps) {
  const strategyInfo = strategies.find((s) => s.value === strategy);
  if (!strategyInfo) return null;

  return (
    <Badge
      variant="secondary"
      className={cn('gap-1', strategyInfo.color, className)}
    >
      {strategyInfo.icon}
      {showLabel && <span>{strategyInfo.label}</span>}
    </Badge>
  );
}

export function getStrategyInfo(strategy: StrategyType): StrategyOption | undefined {
  return strategies.find((s) => s.value === strategy);
}

export function getStrategyIcon(strategy: StrategyType): React.ReactNode {
  const info = getStrategyInfo(strategy);
  return info?.icon || <Zap className="h-4 w-4" />;
}

export function getStrategyLabel(strategy: StrategyType): string {
  const info = getStrategyInfo(strategy);
  return info?.label || strategy;
}

export function getStrategyColor(strategy: StrategyType): string {
  const info = getStrategyInfo(strategy);
  return info?.color || 'bg-gray-500';
}

export default StrategySelector;
