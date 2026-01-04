import { useState, useCallback, useRef } from 'react';
import {
  Upload,
  Download,
  Trash2,
  FileText,
  Copy,
  Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Task } from './TaskPanel';

interface TaskEditorProps {
  tasks: Task[];
  onImport: (tasks: string[]) => void;
  onClear: () => void;
  children?: React.ReactNode;
}

export function TaskEditor({
  tasks,
  onImport,
  onClear,
  children,
}: TaskEditorProps) {
  const [open, setOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Export tasks as text (one per line)
  const exportText = tasks
    .filter((t) => t.status === 'pending')
    .map((t) => t.text)
    .join('\n');

  const handleImport = useCallback(() => {
    const lines = importText
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    
    if (lines.length > 0) {
      onImport(lines);
      setImportText('');
      setOpen(false);
    }
  }, [importText, onImport]);

  const handleExportToClipboard = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(exportText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, [exportText]);

  const handleExportToFile = useCallback(() => {
    const blob = new Blob([exportText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tasks-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [exportText]);

  const handleFileImport = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        setImportText(text);
      };
      reader.readAsText(file);
      
      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    []
  );

  const pendingCount = tasks.filter((t) => t.status === 'pending').length;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children || (
          <Button variant="outline" size="sm">
            <FileText className="h-4 w-4 mr-2" />
            批量操作
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>任务批量操作</DialogTitle>
          <DialogDescription>
            导入、导出或清除任务队列
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Import section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">导入任务</label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt"
                onChange={handleFileImport}
                className="hidden"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-4 w-4 mr-2" />
                从文件导入
              </Button>
            </div>
            <Textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder="每行一个任务，例如：&#10;实现用户登录功能&#10;添加数据验证&#10;编写单元测试"
              rows={6}
            />
            <p className="text-xs text-muted-foreground">
              每行一个任务，空行将被忽略
            </p>
          </div>

          {/* Export section */}
          {pendingCount > 0 && (
            <div className="space-y-2">
              <label className="text-sm font-medium">
                导出任务 ({pendingCount} 个待执行)
              </label>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportToClipboard}
                  className="flex-1"
                >
                  {copied ? (
                    <>
                      <Check className="h-4 w-4 mr-2" />
                      已复制
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4 mr-2" />
                      复制到剪贴板
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportToFile}
                  className="flex-1"
                >
                  <Download className="h-4 w-4 mr-2" />
                  下载文件
                </Button>
              </div>
            </div>
          )}

          {/* Clear section */}
          {tasks.length > 0 && (
            <div className="pt-4 border-t">
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  onClear();
                  setOpen(false);
                }}
                className="w-full"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                清除所有任务 ({tasks.length})
              </Button>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            取消
          </Button>
          <Button
            onClick={handleImport}
            disabled={!importText.trim()}
          >
            导入 {importText.split('\n').filter((l) => l.trim()).length} 个任务
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default TaskEditor;
