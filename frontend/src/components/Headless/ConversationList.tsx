import { useRef, useEffect, useCallback } from 'react';
import { Loader2, ChevronUp } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { TurnCard } from './TurnCard';
import type { TurnInfo, StreamEvent } from '@/types/headless';

interface ConversationListProps {
  turns: TurnInfo[];
  currentTurnEvents?: StreamEvent[];
  currentTurnId?: number | null;
  hasMore: boolean;
  loading: boolean;
  onLoadMore: () => void;
  className?: string;
}

export function ConversationList({
  turns,
  currentTurnEvents,
  currentTurnId,
  hasMore,
  loading,
  onLoadMore,
  className,
}: ConversationListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const isUserScrollingRef = useRef(false);

  // 自动滚动到底部（新消息时）
  const scrollToBottom = useCallback(() => {
    if (!isUserScrollingRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, []);

  // 监听新事件，自动滚动
  useEffect(() => {
    scrollToBottom();
  }, [currentTurnEvents?.length, scrollToBottom]);

  // 监听滚动，检测用户是否在手动滚动
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const isAtBottom = target.scrollHeight - target.scrollTop - target.clientHeight < 100;
    isUserScrollingRef.current = !isAtBottom;

    // 检测是否滚动到顶部，触发加载更多
    if (target.scrollTop < 50 && hasMore && !loading) {
      onLoadMore();
    }
  }, [hasMore, loading, onLoadMore]);


  return (
    <ScrollArea className={cn('h-full', className)}>
      <div
        ref={scrollRef}
        className="p-4 space-y-4"
        onScroll={handleScroll}
      >
        {/* 加载更多按钮 */}
        {hasMore && (
          <div className="flex justify-center py-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={onLoadMore}
              disabled={loading}
              className="text-muted-foreground"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Loading...
                </>
              ) : (
                <>
                  <ChevronUp className="h-4 w-4 mr-2" />
                  Load earlier messages
                </>
              )}
            </Button>
          </div>
        )}

        {/* 空状态 */}
        {turns.length === 0 && !currentTurnEvents?.length && (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <p className="text-sm">No conversation yet</p>
            <p className="text-xs mt-1">Send a prompt to start</p>
          </div>
        )}

        {/* 轮次列表 */}
        {turns.map((turn) => (
          <TurnCard
            key={turn.id}
            turn={turn}
            events={turn.id === currentTurnId ? currentTurnEvents : undefined}
            isLive={turn.id === currentTurnId}
          />
        ))}

        {/* 当前正在进行的轮次（如果不在 turns 中或者还没有 turnId） */}
        {currentTurnEvents && currentTurnEvents.length > 0 && (
          // 只有当 currentTurnId 不在 turns 中时才显示
          (!currentTurnId || !turns.find(t => t.id === currentTurnId)) && (
            <TurnCard
              turn={{
                id: currentTurnId || 0,
                turn_index: turns.length + 1,
                user_prompt: currentTurnEvents.find(e => e.type === 'user')?.message?.content?.[0]?.text || '',
                prompt_source: 'user',
                input_tokens: 0,
                output_tokens: 0,
                cost_usd: 0,
                duration_ms: 0,
                state: 'running',
                created_at: new Date().toISOString(),
              }}
              events={currentTurnEvents}
              isLive
            />
          )
        )}

        {/* 滚动锚点 */}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  );
}

export default ConversationList;
