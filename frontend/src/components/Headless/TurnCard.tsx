import { useState, useMemo } from 'react';
import {
  ChevronDown,
  ChevronRight,
  User,
  Bot,
  Clock,
  Coins,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Wrench,
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { TurnInfo, StreamEvent, MessageContent } from '@/types/headless';

interface TurnCardProps {
  turn: TurnInfo;
  events?: StreamEvent[];
  isLive?: boolean;
  className?: string;
}

const stateIcons = {
  pending: Clock,
  running: Loader2,
  completed: CheckCircle2,
  error: AlertCircle,
};

const stateColors = {
  pending: 'text-muted-foreground',
  running: 'text-blue-500',
  completed: 'text-green-500',
  error: 'text-red-500',
};

export function TurnCard({ turn, events, isLive, className }: TurnCardProps) {
  const [expanded, setExpanded] = useState(false);

  const StateIcon = stateIcons[turn.state];

  // 从事件中提取助手响应
  const assistantContent = useMemo(() => {
    if (turn.assistant_response) {
      return turn.assistant_response;
    }
    if (!events?.length) return null;

    const contents: MessageContent[] = [];
    for (const event of events) {
      if (event.type === 'assistant' && event.message?.content) {
        contents.push(...event.message.content);
      }
    }
    return contents;
  }, [turn.assistant_response, events]);


  // 渲染消息内容
  const renderContent = (content: MessageContent) => {
    switch (content.type) {
      case 'text':
        return (
          <div key={content.text?.slice(0, 20)} className="whitespace-pre-wrap text-sm">
            {content.text}
          </div>
        );
      case 'thinking':
        return (
          <div key={content.thinking?.slice(0, 20)} className="text-sm text-muted-foreground italic border-l-2 border-muted pl-3 my-2">
            <span className="text-xs font-medium">Thinking:</span>
            <div className="whitespace-pre-wrap mt-1">{content.thinking}</div>
          </div>
        );
      case 'tool_use':
        return (
          <div key={content.id} className="my-2 p-2 bg-muted/50 rounded-md">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Wrench className="h-4 w-4" />
              <span>{content.name}</span>
            </div>
            {expanded && content.input && (
              <pre className="mt-2 text-xs overflow-x-auto">
                {JSON.stringify(content.input, null, 2)}
              </pre>
            )}
          </div>
        );
      case 'tool_result':
        return (
          <div key={content.tool_use_id} className="my-2 p-2 bg-muted/30 rounded-md text-sm">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <span>Tool Result</span>
              {content.is_error && <Badge variant="destructive" className="text-xs">Error</Badge>}
            </div>
            {expanded && (
              <pre className="text-xs overflow-x-auto">
                {typeof content.content === 'string' 
                  ? content.content 
                  : JSON.stringify(content.content, null, 2)}
              </pre>
            )}
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <Card className={cn('transition-all', className)}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          {/* 用户输入 */}
          <div className="flex items-start gap-2 flex-1">
            <div className="p-1.5 rounded-full bg-primary/10">
              <User className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs text-muted-foreground">Turn #{turn.turn_index}</span>
                <Badge variant="outline" className="text-xs">
                  {turn.prompt_source}
                </Badge>
              </div>
              <p className="text-sm font-medium">{turn.user_prompt}</p>
            </div>
          </div>

          {/* 状态和统计 */}
          <div className="flex items-center gap-2">
            <StateIcon className={cn('h-4 w-4', stateColors[turn.state], turn.state === 'running' && 'animate-spin')} />
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </CardHeader>


      <CardContent className="pt-0">
        {/* 助手响应 */}
        {assistantContent && (
          <div className="flex items-start gap-2 mt-3">
            <div className="p-1.5 rounded-full bg-secondary">
              <Bot className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              {typeof assistantContent === 'string' ? (
                <p className="text-sm whitespace-pre-wrap">{assistantContent}</p>
              ) : (
                <div className="space-y-1">
                  {assistantContent.map((content, idx) => (
                    <div key={idx}>{renderContent(content)}</div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 实时输出指示器 */}
        {isLive && turn.state === 'running' && (
          <div className="flex items-center gap-2 mt-3 text-sm text-blue-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Processing...</span>
          </div>
        )}

        {/* 错误信息 */}
        {turn.error_message && (
          <div className="mt-3 p-2 bg-destructive/10 rounded-md">
            <div className="flex items-center gap-2 text-destructive text-sm">
              <AlertCircle className="h-4 w-4" />
              <span>{turn.error_message}</span>
            </div>
          </div>
        )}

        {/* 展开的详细信息 */}
        {expanded && (
          <div className="mt-3 pt-3 border-t space-y-2">
            <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
              {turn.model && (
                <span>Model: {turn.model}</span>
              )}
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {turn.duration_ms}ms
              </span>
              <span className="flex items-center gap-1">
                <Coins className="h-3 w-3" />
                ${turn.cost_usd.toFixed(4)}
              </span>
              <span>
                Tokens: {turn.input_tokens} in / {turn.output_tokens} out
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default TurnCard;
