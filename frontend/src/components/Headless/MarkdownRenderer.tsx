import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { cn } from '@/lib/utils';
import { Copy, Check } from 'lucide-react';
import { useState, useCallback } from 'react';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

// 代码块组件，支持复制功能
function CodeBlock({
  language,
  children
}: {
  language: string | undefined;
  children: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [children]);

  return (
    <div className="relative group my-3">
      <div className="absolute right-2 top-2 z-10">
        <button
          onClick={handleCopy}
          className="p-1.5 rounded bg-muted/80 hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity"
          title="Copy code"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-green-500" />
          ) : (
            <Copy className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </button>
      </div>
      {language && (
        <div className="absolute left-3 top-0 -translate-y-1/2 px-2 py-0.5 text-xs bg-muted rounded text-muted-foreground">
          {language}
        </div>
      )}
      <SyntaxHighlighter
        style={oneDark}
        language={language || 'text'}
        PreTag="div"
        customStyle={{
          margin: 0,
          borderRadius: '0.5rem',
          padding: '1.25rem 1rem 1rem',
          fontSize: '0.875rem',
        }}
      >
        {children}
      </SyntaxHighlighter>
    </div>
  );
}

export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  return (
    <ReactMarkdown
      className={cn('markdown-content', className)}
      remarkPlugins={[remarkGfm]}
      components={{
        // 代码块
        code({ className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || '');
          const isInline = !match && !className;
          const codeContent = String(children).replace(/\n$/, '');

          if (isInline) {
            return (
              <code
                className="px-1.5 py-0.5 rounded bg-muted text-sm font-mono"
                {...props}
              >
                {children}
              </code>
            );
          }

          return (
            <CodeBlock language={match?.[1]}>
              {codeContent}
            </CodeBlock>
          );
        },
        // 段落
        p({ children }) {
          return <p className="mb-3 last:mb-0 leading-relaxed">{children}</p>;
        },
        // 标题
        h1({ children }) {
          return <h1 className="text-2xl font-bold mb-4 mt-6 first:mt-0">{children}</h1>;
        },
        h2({ children }) {
          return <h2 className="text-xl font-bold mb-3 mt-5 first:mt-0">{children}</h2>;
        },
        h3({ children }) {
          return <h3 className="text-lg font-semibold mb-2 mt-4 first:mt-0">{children}</h3>;
        },
        h4({ children }) {
          return <h4 className="text-base font-semibold mb-2 mt-3 first:mt-0">{children}</h4>;
        },
        // 列表
        ul({ children }) {
          return <ul className="list-disc list-inside mb-3 space-y-1">{children}</ul>;
        },
        ol({ children }) {
          return <ol className="list-decimal list-inside mb-3 space-y-1">{children}</ol>;
        },
        li({ children }) {
          return <li className="leading-relaxed">{children}</li>;
        },
        // 链接
        a({ href, children }) {
          return (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              {children}
            </a>
          );
        },
        // 引用块
        blockquote({ children }) {
          return (
            <blockquote className="border-l-4 border-muted pl-4 my-3 italic text-muted-foreground">
              {children}
            </blockquote>
          );
        },
        // 表格
        table({ children }) {
          return (
            <div className="overflow-x-auto my-3">
              <table className="min-w-full border-collapse border border-border">
                {children}
              </table>
            </div>
          );
        },
        th({ children }) {
          return (
            <th className="border border-border bg-muted px-3 py-2 text-left font-semibold">
              {children}
            </th>
          );
        },
        td({ children }) {
          return (
            <td className="border border-border px-3 py-2">
              {children}
            </td>
          );
        },
        // 分隔线
        hr() {
          return <hr className="my-4 border-border" />;
        },
        // 强调
        strong({ children }) {
          return <strong className="font-semibold">{children}</strong>;
        },
        em({ children }) {
          return <em className="italic">{children}</em>;
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

export default MarkdownRenderer;
