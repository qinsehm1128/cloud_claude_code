import { useState, useCallback } from 'react';
import {
  Plus,
  Trash2,
  GripVertical,
  CheckCircle2,
  Circle,
  PlayCircle,
  XCircle,
  ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

export interface Task {
  id: number;
  text: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  order: number;
}

interface TaskPanelProps {
  tasks: Task[];
  onAddTask: (text: string) => void;
  onRemoveTask: (id: number) => void;
  onReorderTasks: (taskIds: number[]) => void;
  onClearTasks: () => void;
  className?: string;
}

const statusIcons: Record<Task['status'], typeof Circle> = {
  pending: Circle,
  running: PlayCircle,
  completed: CheckCircle2,
  failed: XCircle,
};

const statusColors: Record<Task['status'], string> = {
  pending: 'text-muted-foreground',
  running: 'text-blue-500 animate-pulse',
  completed: 'text-green-500',
  failed: 'text-red-500',
};

const statusLabels: Record<Task['status'], string> = {
  pending: '待执行',
  running: '执行中',
  completed: '已完成',
  failed: '失败',
};

export function TaskPanel({
  tasks,
  onAddTask,
  onRemoveTask,
  onReorderTasks,
  onClearTasks,
  className,
}: TaskPanelProps) {
  const [newTaskText, setNewTaskText] = useState('');
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const [dragOverId, setDragOverId] = useState<number | null>(null);

  const handleAddTask = useCallback(() => {
    if (newTaskText.trim()) {
      onAddTask(newTaskText.trim());
      setNewTaskText('');
    }
  }, [newTaskText, onAddTask]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleAddTask();
      }
    },
    [handleAddTask]
  );

  const handleDragStart = useCallback((e: React.DragEvent, taskId: number) => {
    setDraggedId(taskId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', taskId.toString());
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, taskId: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverId(taskId);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggedId(null);
    setDragOverId(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, targetId: number) => {
      e.preventDefault();
      const sourceId = parseInt(e.dataTransfer.getData('text/plain'));
      
      if (sourceId === targetId) {
        handleDragEnd();
        return;
      }

      const taskIds = tasks.map((t) => t.id);
      const sourceIndex = taskIds.indexOf(sourceId);
      const targetIndex = taskIds.indexOf(targetId);

      if (sourceIndex === -1 || targetIndex === -1) {
        handleDragEnd();
        return;
      }

      // Reorder
      const newOrder = [...taskIds];
      newOrder.splice(sourceIndex, 1);
      newOrder.splice(targetIndex, 0, sourceId);

      onReorderTasks(newOrder);
      handleDragEnd();
    },
    [tasks, onReorderTasks, handleDragEnd]
  );

  const pendingCount = tasks.filter((t) => t.status === 'pending').length;
  const completedCount = tasks.filter((t) => t.status === 'completed').length;

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <h3 className="font-medium text-sm">任务队列</h3>
          <Badge variant="secondary" className="text-xs">
            {pendingCount} 待执行
          </Badge>
        </div>
        {tasks.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearTasks}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Add task input */}
      <div className="px-4 py-3 border-b">
        <div className="flex gap-2">
          <Input
            value={newTaskText}
            onChange={(e) => setNewTaskText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入新任务..."
            className="flex-1"
          />
          <Button size="sm" onClick={handleAddTask} disabled={!newTaskText.trim()}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Task list */}
      <ScrollArea className="flex-1">
        <div className="p-2">
          {tasks.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              <p>暂无任务</p>
              <p className="text-xs mt-1">添加任务后，静默触发时将自动执行</p>
            </div>
          ) : (
            <div className="space-y-1">
              {tasks.map((task) => {
                const StatusIcon = statusIcons[task.status];
                const isDragging = draggedId === task.id;
                const isDragOver = dragOverId === task.id;

                return (
                  <div
                    key={task.id}
                    draggable={task.status === 'pending'}
                    onDragStart={(e) => handleDragStart(e, task.id)}
                    onDragOver={(e) => handleDragOver(e, task.id)}
                    onDragEnd={handleDragEnd}
                    onDrop={(e) => handleDrop(e, task.id)}
                    className={cn(
                      'flex items-center gap-2 p-2 rounded-md transition-colors',
                      'hover:bg-muted/50 group',
                      isDragging && 'opacity-50',
                      isDragOver && 'bg-muted border-t-2 border-primary'
                    )}
                  >
                    {/* Drag handle */}
                    {task.status === 'pending' && (
                      <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
                    )}
                    {task.status !== 'pending' && <div className="w-4" />}

                    {/* Status icon */}
                    <StatusIcon className={cn('h-4 w-4', statusColors[task.status])} />

                    {/* Task text */}
                    <div className="flex-1 min-w-0">
                      <p
                        className={cn(
                          'text-sm truncate',
                          task.status === 'completed' && 'line-through text-muted-foreground'
                        )}
                      >
                        {task.text}
                      </p>
                    </div>

                    {/* Status badge for running */}
                    {task.status === 'running' && (
                      <Badge variant="secondary" className="text-xs">
                        {statusLabels[task.status]}
                      </Badge>
                    )}

                    {/* Delete button */}
                    {task.status === 'pending' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onRemoveTask(task.id)}
                        className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Footer stats */}
      {tasks.length > 0 && (
        <div className="px-4 py-2 border-t text-xs text-muted-foreground">
          <div className="flex items-center justify-between">
            <span>
              共 {tasks.length} 个任务，{completedCount} 已完成
            </span>
            {pendingCount > 0 && (
              <span className="flex items-center gap-1">
                <ChevronRight className="h-3 w-3" />
                下一个: {tasks.find((t) => t.status === 'pending')?.text.slice(0, 20)}...
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default TaskPanel;
