import { useState, useCallback, useRef } from 'react';
import { Send, Square, Loader2, Power } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

interface PromptInputProps {
  onSend: (prompt: string) => void;
  onCancel: () => void;
  onStopSession?: () => void;
  isRunning: boolean;
  canStopSession?: boolean;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

export function PromptInput({
  onSend,
  onCancel,
  onStopSession,
  isRunning,
  canStopSession = false,
  disabled,
  placeholder = 'Enter your prompt...',
  className,
}: PromptInputProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isComposingRef = useRef(false);

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (trimmed && !disabled) {
      onSend(trimmed);
      setValue('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  }, [value, disabled, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (isComposingRef.current) {
        return;
      }
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const handleCompositionStart = useCallback(() => {
    isComposingRef.current = true;
  }, []);

  const handleCompositionEnd = useCallback(() => {
    isComposingRef.current = false;
  }, []);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    const textarea = e.target;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
  }, []);

  return (
    <div className={cn('flex items-end gap-2 p-4 border-t bg-background', className)}>
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onCompositionStart={handleCompositionStart}
        onCompositionEnd={handleCompositionEnd}
        placeholder={isRunning ? 'Type to queue a message...' : placeholder}
        disabled={disabled}
        className="min-h-[40px] max-h-[200px] resize-none"
        rows={1}
      />

      <div className="flex gap-1 shrink-0">
        {canStopSession && onStopSession && (
          <Button
            variant="outline"
            size="icon"
            onClick={onStopSession}
            title="Stop current session"
          >
            <Power className="h-4 w-4" />
          </Button>
        )}
        {/* 发送按钮 - 始终可用（运行中发送的消息会进入队列） */}
        <Button
          size="icon"
          onClick={handleSend}
          disabled={!value.trim() || disabled}
          variant={isRunning ? 'secondary' : 'default'}
          title={isRunning ? 'Queue message' : 'Send message'}
        >
          {disabled ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
        {/* 取消按钮 - 仅在运行中显示 */}
        {isRunning && (
          <Button
            variant="destructive"
            size="icon"
            onClick={onCancel}
            title="Cancel current execution only"
          >
            <Square className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

export default PromptInput;
