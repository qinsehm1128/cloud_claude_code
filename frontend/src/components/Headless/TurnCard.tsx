import { useEffect, useMemo, useState } from 'react';
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
  Terminal,
  FileText,
  Eye,
  EyeOff,
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { MarkdownRenderer } from './MarkdownRenderer';
import { buildAssistantRenderItems, isToolRenderItem, type AssistantRenderItem } from './renderItems';
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

// 工具调用组件（可折叠）
function ToolUseBlock({
  content,
  defaultExpanded = false,
}: {
  content: MessageContent;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  useEffect(() => {
    setExpanded(defaultExpanded);
  }, [defaultExpanded]);

  return (
    <div className="my-2 rounded-lg border border-border/50 bg-muted/30 overflow-hidden w-full">
      <button
        type="button"
        aria-label={`Tool ${content.name || 'call'}`}
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/50 transition-colors min-w-0"
      >
        <Wrench className="h-4 w-4 text-blue-500 flex-shrink-0" />
        <span className="text-sm font-medium flex-1 text-left truncate min-w-0">
          {content.name}
        </span>
        <Badge variant="outline" className="text-xs flex-shrink-0">Tool</Badge>
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        )}
      </button>
      {expanded && content.input && (
        <div className="px-3 pb-3 border-t border-border/30 overflow-hidden" data-testid="tool-use-body">
          <pre className="mt-2 text-xs overflow-x-auto bg-background/50 rounded p-2 w-full">
            {JSON.stringify(content.input, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

// 工具结果组件（可折叠）
function ToolResultBlock({
  content,
  defaultExpanded = false,
}: {
  content: MessageContent;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  useEffect(() => {
    setExpanded(defaultExpanded);
  }, [defaultExpanded]);

  const preview = useMemo(() => {
    if (!content.content) return '';
    const text = typeof content.content === 'string'
      ? content.content
      : JSON.stringify(content.content);
    return text.length > 100 ? text.slice(0, 100) + '...' : text;
  }, [content.content]);

  return (
    <div className={cn(
      'my-2 rounded-lg border overflow-hidden w-full',
      content.is_error
        ? 'border-red-500/30 bg-red-500/5'
        : 'border-border/50 bg-muted/20',
    )}>
      <button
        type="button"
        aria-label={`Tool result ${content.tool_use_id || 'output'}`}
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/30 transition-colors min-w-0"
      >
        <Terminal className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        <span className="text-xs text-muted-foreground flex-1 text-left truncate min-w-0">
          {preview || 'Tool Result'}
        </span>
        {content.is_error && (
          <Badge variant="destructive" className="text-xs flex-shrink-0">Error</Badge>
        )}
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        )}
      </button>
      {expanded && (
        <div className="px-3 pb-3 border-t border-border/30 overflow-hidden" data-testid="tool-result-body">
          <pre className="mt-2 text-xs overflow-x-auto bg-background/50 rounded p-2 max-h-96 w-full">
            {typeof content.content === 'string'
              ? content.content
              : JSON.stringify(content.content, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

// Thinking 块组件
function ThinkingBlock({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="my-2 rounded-lg border border-purple-500/30 bg-purple-500/5 overflow-hidden">
      <button
        type="button"
        aria-label="Thinking"
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-purple-500/10 transition-colors"
      >
        <FileText className="h-4 w-4 text-purple-500 flex-shrink-0" />
        <span className="text-sm font-medium text-purple-500">Thinking</span>
        <span className="text-xs text-muted-foreground flex-1 text-left truncate">
          {content.slice(0, 50)}...
        </span>
        {expanded ? (
          <EyeOff className="h-4 w-4 text-muted-foreground" />
        ) : (
          <Eye className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
      {expanded && (
        <div className="px-3 pb-3 border-t border-purple-500/20">
          <div className="mt-2 text-sm text-muted-foreground whitespace-pre-wrap break-words">
            {content}
          </div>
        </div>
      )}
    </div>
  );
}

function renderAssistantItem(
  item: AssistantRenderItem,
  shouldExpandToolCards: boolean,
  showToolCalls: boolean,
) {
  const { content, key } = item;

  if (isToolRenderItem(item) && !showToolCalls) {
    return null;
  }

  switch (content.type) {
    case 'text':
      return (
        <div key={key} className="text-sm break-words">
          <MarkdownRenderer content={content.text || ''} />
        </div>
      );
    case 'tool_use':
      return <ToolUseBlock key={key} content={content} defaultExpanded={shouldExpandToolCards} />;
    case 'tool_result':
      return <ToolResultBlock key={key} content={content} defaultExpanded={shouldExpandToolCards} />;
    case 'thinking':
      return <ThinkingBlock key={key} content={content.thinking || ''} />;
    default:
      return null;
  }
}

export function TurnCard({ turn, events, isLive, className }: TurnCardProps) {
  const [showDetails, setShowDetails] = useState(false);
  const [showToolCalls, setShowToolCalls] = useState(true);

  const StateIcon = stateIcons[turn.state];
  const renderItems = useMemo(
    () => buildAssistantRenderItems(turn, events),
    [turn, events],
  );
  const toolCallCount = useMemo(
    () => renderItems.filter(isToolRenderItem).length,
    [renderItems],
  );
  const shouldExpandToolCards = Boolean(isLive && turn.state === 'running');
  const hasAssistantContent = renderItems.length > 0;

  return (
    <Card className={cn('transition-all overflow-hidden', className)}>
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

          {/* 状态和操作按钮 */}
          <div className="flex items-center gap-1">
            <StateIcon className={cn('h-4 w-4', stateColors[turn.state], turn.state === 'running' && 'animate-spin')} />
            {toolCallCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs gap-1"
                onClick={() => setShowToolCalls(!showToolCalls)}
                title={showToolCalls ? 'Hide tool calls' : 'Show tool calls'}
              >
                <Wrench className="h-3 w-3" />
                <span>{toolCallCount}</span>
                {showToolCalls ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={() => setShowDetails(!showDetails)}
              title={showDetails ? 'Hide details' : 'Show details'}
            >
              {showDetails ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0 overflow-hidden">
        {/* 助手响应 */}
        {hasAssistantContent && (
          <div className="flex items-start gap-2 mt-3 min-w-0">
            <div className="p-1.5 rounded-full bg-secondary flex-shrink-0">
              <Bot className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0 overflow-hidden space-y-3" data-testid="assistant-response">
              {renderItems.map(item => renderAssistantItem(item, shouldExpandToolCards, showToolCalls))}
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
        {showDetails && (
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
