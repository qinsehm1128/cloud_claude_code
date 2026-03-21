import { useRef, useEffect, useCallback, useState } from 'react';
import { Loader2, ChevronUp, ChevronDown, ArrowUp, ArrowDown } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { TurnCard } from './TurnCard';
import type { TurnInfo, StreamEvent, QueuedTurnInfo } from '@/types/headless';

interface ConversationListProps {
  turns: TurnInfo[];
  currentTurnEvents?: StreamEvent[];
  currentTurnId?: number | null;
  hasMore: boolean;
  loading: boolean;
  onLoadMore: () => void;
  queuedTurns?: QueuedTurnInfo[];
  onDeleteQueued?: (turnId: number) => void;
  onEditQueued?: (turnId: number, newPrompt: string) => void;
  className?: string;
}

export function ConversationList({
  turns,
  currentTurnEvents,
  currentTurnId,
  hasMore,
  loading,
  onLoadMore,
  queuedTurns,
  onDeleteQueued,
  onEditQueued,
  className,
}: ConversationListProps) {
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const isUserScrollingRef = useRef(false);
  const userScrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showScrollToTop, setShowScrollToTop] = useState(false);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);

  // 获取 ScrollArea 内部的真实 viewport 元素
  const getViewport = useCallback((): HTMLElement | null => {
    if (!scrollAreaRef.current) return null;
    return scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement | null;
  }, []);

  // 滚动到底部
  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const viewport = getViewport();
    if (viewport) {
      viewport.scrollTo({ top: viewport.scrollHeight, behavior });
    }
  }, [getViewport]);

  // 滚动到顶部
  const scrollToTop = useCallback(() => {
    const viewport = getViewport();
    if (viewport) {
      viewport.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [getViewport]);

  // 自动滚动到底部（仅在用户没有手动滚动时）
  useEffect(() => {
    if (!isUserScrollingRef.current) {
      scrollToBottom('smooth');
    }
  }, [currentTurnEvents?.length, scrollToBottom]);

  // 绑定 scroll 监听到 ScrollArea 的真实 viewport
  useEffect(() => {
    const viewport = getViewport();
    if (!viewport) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = viewport;
      const distanceToBottom = scrollHeight - scrollTop - clientHeight;
      const isAtBottom = distanceToBottom < 150;
      const isAtTop = scrollTop < 50;

      // 用户手动滚动检测：如果不在底部，标记为用户滚动
      if (!isAtBottom) {
        isUserScrollingRef.current = true;
        // 清除之前的超时
        if (userScrollTimeoutRef.current) {
          clearTimeout(userScrollTimeoutRef.current);
        }
      } else {
        // 回到底部时，取消用户滚动标记
        isUserScrollingRef.current = false;
        if (userScrollTimeoutRef.current) {
          clearTimeout(userScrollTimeoutRef.current);
          userScrollTimeoutRef.current = null;
        }
      }

      // 更新浮动按钮显示状态
      setShowScrollToTop(scrollTop > 300);
      setShowScrollToBottom(distanceToBottom > 300);

      // 滚动到顶部时加载更多
      if (isAtTop && hasMore && !loading) {
        onLoadMore();
      }
    };

    viewport.addEventListener('scroll', handleScroll, { passive: true });
    // 初始检查
    handleScroll();

    return () => {
      viewport.removeEventListener('scroll', handleScroll);
    };
  }, [getViewport, hasMore, loading, onLoadMore]);

  // 清理 timeout
  useEffect(() => {
    return () => {
      if (userScrollTimeoutRef.current) {
        clearTimeout(userScrollTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div className="relative h-full">
      <ScrollArea ref={scrollAreaRef} className={cn('h-full', className)}>
        <div className="p-4 space-y-4 overflow-x-hidden">
          {/* 顶部锚点 */}
          <div ref={topRef} />

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

          {/* 排队中的消息 */}
          {queuedTurns && queuedTurns.length > 0 && queuedTurns.map((qt) => (
            <TurnCard
              key={`queued-${qt.turn_id}`}
              turn={{
                id: qt.turn_id,
                turn_id: qt.turn_id,
                turn_index: qt.turn_index,
                user_prompt: qt.prompt,
                prompt_source: qt.source as TurnInfo['prompt_source'],
                input_tokens: 0,
                output_tokens: 0,
                cost_usd: 0,
                duration_ms: 0,
                state: 'pending',
                created_at: new Date().toISOString(),
              }}
              onDelete={onDeleteQueued}
              onEdit={onEditQueued}
            />
          ))}

          {/* 滚动锚点 */}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      {/* 浮动按钮：快速滚动到顶部 */}
      {showScrollToTop && (
        <Button
          variant="secondary"
          size="icon"
          className="absolute top-3 right-6 z-10 h-8 w-8 rounded-full shadow-md opacity-80 hover:opacity-100 transition-opacity"
          onClick={scrollToTop}
          title="Scroll to top"
        >
          <ArrowUp className="h-4 w-4" />
        </Button>
      )}

      {/* 浮动按钮：快速滚动到底部 */}
      {showScrollToBottom && (
        <Button
          variant="secondary"
          size="icon"
          className="absolute bottom-3 right-6 z-10 h-8 w-8 rounded-full shadow-md opacity-80 hover:opacity-100 transition-opacity"
          onClick={() => {
            isUserScrollingRef.current = false;
            scrollToBottom('smooth');
          }}
          title="Scroll to bottom"
        >
          <ArrowDown className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

export default ConversationList;
