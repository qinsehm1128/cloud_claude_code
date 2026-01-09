import { useState, useCallback, useRef } from 'react';
import { Send, Square, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

interface PromptInputProps {
  onSend: (prompt: string) => void;
  onCancel: () => void;
  isRunning: boolean;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

export function PromptInput({
  onSend,
  onCancel,
  isRunning,
  disabled,
  placeholder = 'Enter your prompt...',
  className,
}: PromptInputProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isComposingRef = useRef(false);

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (trimmed && !isRunning && !disabled) {
      onSend(trimmed);
      setValue('');
      // 重置 textarea 高度
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  }, [value, isRunning, disabled, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // 忽略 IME 输入过程中的 Enter
      if (isComposingRef.current) {
        return;
      }
      // Ctrl/Cmd + Enter 发送
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

  // 自动调整高度
  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    // 自动调整高度
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
        placeholder={placeholder}
        disabled={disabled}
        className="min-h-[40px] max-h-[200px] resize-none"
        rows={1}
      />
      
      {isRunning ? (
        <Button
          variant="destructive"
          size="icon"
          onClick={onCancel}
          className="shrink-0"
        >
          <Square className="h-4 w-4" />
        </Button>
      ) : (
        <Button
          size="icon"
          onClick={handleSend}
          disabled={!value.trim() || disabled}
          className="shrink-0"
        >
          {disabled ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      )}
    </div>
  );
}

export default PromptInput;
