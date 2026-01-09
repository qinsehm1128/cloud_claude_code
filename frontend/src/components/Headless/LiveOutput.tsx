import { useMemo } from 'react';
import { Bot, Wrench, AlertCircle, CheckCircle2, Brain } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { StreamEvent, MessageContent } from '@/types/headless';

interface LiveOutputProps {
  events: StreamEvent[];
  className?: string;
}

export function LiveOutput({ events, className }: LiveOutputProps) {
  // 聚合所有内容
  const contents = useMemo(() => {
    const result: Array<{
      type: 'text' | 'thinking' | 'tool_use' | 'tool_result' | 'system' | 'result';
      content: MessageContent | StreamEvent;
      key: string;
    }> = [];

    events.forEach((event, eventIdx) => {
      if (event.type === 'system') {
        result.push({
          type: 'system',
          content: event,
          key: `system-${eventIdx}`,
        });
      } else if (event.type === 'assistant' && event.message?.content) {
        event.message.content.forEach((content, contentIdx) => {
          result.push({
            type: content.type,
            content,
            key: `${eventIdx}-${contentIdx}`,
          });
        });
      } else if (event.type === 'result') {
        result.push({
          type: 'result',
          content: event,
          key: `result-${eventIdx}`,
        });
      }
    });

    return result;
  }, [events]);

  if (events.length === 0) {
    return null;
  }


  const renderContent = (item: typeof contents[0]) => {
    const { type, content, key } = item;

    switch (type) {
      case 'system': {
        const event = content as StreamEvent;
        return (
          <div key={key} className="text-xs text-muted-foreground py-1">
            <span className="font-medium">System:</span> {event.subtype}
            {event.model && <span className="ml-2">Model: {event.model}</span>}
          </div>
        );
      }

      case 'text': {
        const msg = content as MessageContent;
        return (
          <div key={key} className="whitespace-pre-wrap text-sm py-1">
            {msg.text}
          </div>
        );
      }

      case 'thinking': {
        const msg = content as MessageContent;
        return (
          <div key={key} className="py-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Brain className="h-3 w-3" />
              <span>Thinking</span>
            </div>
            <div className="text-sm text-muted-foreground italic border-l-2 border-muted pl-3 whitespace-pre-wrap">
              {msg.thinking}
            </div>
          </div>
        );
      }

      case 'tool_use': {
        const msg = content as MessageContent;
        return (
          <div key={key} className="py-2">
            <div className="flex items-center gap-2 text-sm">
              <Wrench className="h-4 w-4 text-blue-500" />
              <span className="font-medium">{msg.name}</span>
              <Badge variant="outline" className="text-xs">Tool Call</Badge>
            </div>
            {msg.input && (
              <pre className="mt-1 p-2 bg-muted/50 rounded text-xs overflow-x-auto">
                {JSON.stringify(msg.input, null, 2)}
              </pre>
            )}
          </div>
        );
      }

      case 'tool_result': {
        const msg = content as MessageContent;
        return (
          <div key={key} className="py-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              {msg.is_error ? (
                <AlertCircle className="h-3 w-3 text-destructive" />
              ) : (
                <CheckCircle2 className="h-3 w-3 text-green-500" />
              )}
              <span>Tool Result</span>
              {msg.is_error && <Badge variant="destructive" className="text-xs">Error</Badge>}
            </div>
            <pre className="p-2 bg-muted/30 rounded text-xs overflow-x-auto max-h-[200px]">
              {typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content, null, 2)}
            </pre>
          </div>
        );
      }

      case 'result': {
        const event = content as StreamEvent;
        return (
          <div key={key} className="py-2 border-t mt-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <CheckCircle2 className="h-3 w-3 text-green-500" />
              <span>Completed</span>
              {event.duration_ms && <span>in {event.duration_ms}ms</span>}
              {event.cost_usd && <span>• ${event.cost_usd.toFixed(4)}</span>}
            </div>
            {event.result && (
              <div className="mt-1 text-sm">{event.result}</div>
            )}
          </div>
        );
      }

      default:
        return null;
    }
  };


  return (
    <Card className={cn('border-blue-500/50', className)}>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="p-1.5 rounded-full bg-blue-500/10">
            <Bot className="h-4 w-4 text-blue-500" />
          </div>
          <span className="text-sm font-medium">Live Output</span>
          <div className="flex-1" />
          <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
        </div>

        <div className="space-y-1">
          {contents.map(renderContent)}
        </div>
      </CardContent>
    </Card>
  );
}

export default LiveOutput;
