import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Download, Trash2, Filter, ChevronLeft, ChevronRight, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { automationLogsApi, AutomationLog, LogsFilter, LogStats } from '@/services/automationLogsApi';

const strategies = [
  { value: '', label: '全部策略' },
  { value: 'webhook', label: 'Webhook' },
  { value: 'injection', label: '命令注入' },
  { value: 'queue', label: '任务队列' },
  { value: 'ai', label: 'AI 决策' },
];

const results = [
  { value: '', label: '全部结果' },
  { value: 'success', label: '成功' },
  { value: 'failed', label: '失败' },
  { value: 'skipped', label: '跳过' },
];

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function ResultBadge({ result }: { result: string }) {
  const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    success: 'default',
    failed: 'destructive',
    skipped: 'secondary',
  };
  return <Badge variant={variants[result] || 'outline'}>{result}</Badge>;
}

function StrategyBadge({ strategy }: { strategy: string }) {
  const labels: Record<string, string> = {
    webhook: 'Webhook',
    injection: '注入',
    queue: '队列',
    ai: 'AI',
  };
  return <Badge variant="outline">{labels[strategy] || strategy}</Badge>;
}

export function AutomationLogs() {
  const [logs, setLogs] = useState<AutomationLog[]>([]);
  const [stats, setStats] = useState<LogStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<LogsFilter>({ page: 1, pageSize: 20 });
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [selectedLog, setSelectedLog] = useState<AutomationLog | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const response = await automationLogsApi.listLogs(filter);
      setLogs(response.logs || []);
      setTotalPages(response.total_pages);
      setTotal(response.total);
    } catch (err) {
      console.error('Failed to fetch logs:', err);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  const fetchStats = useCallback(async () => {
    try {
      const statsData = await automationLogsApi.getStats(filter.containerId);
      setStats(statsData);
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    }
  }, [filter.containerId]);

  useEffect(() => {
    fetchLogs();
    fetchStats();
  }, [fetchLogs, fetchStats]);

  const handleExport = async () => {
    try {
      const blob = await automationLogsApi.exportLogs({
        containerId: filter.containerId,
        from: filter.from,
        to: filter.to,
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `automation_logs_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error('Failed to export logs:', err);
    }
  };

  const handleCleanup = async (days: number) => {
    try {
      const result = await automationLogsApi.deleteOldLogs(days);
      alert(`已删除 ${result.deleted_count} 条日志`);
      fetchLogs();
      fetchStats();
    } catch (err) {
      console.error('Failed to cleanup logs:', err);
    }
  };

  const handlePageChange = (newPage: number) => {
    setFilter({ ...filter, page: newPage });
  };

  return (
    <div className="container max-w-6xl py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">自动化日志</h1>
          <p className="text-muted-foreground">查看和管理自动化执行记录</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowFilters(!showFilters)}>
            <Filter className="h-4 w-4 mr-2" />
            筛选
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" />
            导出
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Trash2 className="h-4 w-4 mr-2" />
                清理
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>清理旧日志</AlertDialogTitle>
                <AlertDialogDescription>
                  选择要删除多少天前的日志。此操作不可撤销。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>取消</AlertDialogCancel>
                <AlertDialogAction onClick={() => handleCleanup(7)}>7天前</AlertDialogAction>
                <AlertDialogAction onClick={() => handleCleanup(30)}>30天前</AlertDialogAction>
                <AlertDialogAction onClick={() => handleCleanup(90)}>90天前</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button variant="outline" size="sm" onClick={fetchLogs}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>总日志数</CardDescription>
              <CardTitle className="text-2xl">{stats.total_count}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>24小时内</CardDescription>
              <CardTitle className="text-2xl">{stats.recent_count}</CardTitle>
            </CardHeader>
          </Card>
          {stats.strategy_stats?.slice(0, 2).map((s) => (
            <Card key={s.strategy_type}>
              <CardHeader className="pb-2">
                <CardDescription>{s.strategy_type} 成功率</CardDescription>
                <CardTitle className="text-2xl">
                  {s.count > 0 ? Math.round((s.success_count / s.count) * 100) : 0}%
                </CardTitle>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}

      {/* Filters */}
      {showFilters && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">筛选条件</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>容器 ID</Label>
                <Input
                  type="number"
                  placeholder="全部"
                  value={filter.containerId || ''}
                  onChange={(e) =>
                    setFilter({
                      ...filter,
                      containerId: e.target.value ? parseInt(e.target.value) : undefined,
                      page: 1,
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>策略类型</Label>
                <Select
                  value={filter.strategy || ''}
                  onValueChange={(value) =>
                    setFilter({ ...filter, strategy: value || undefined, page: 1 })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="全部策略" />
                  </SelectTrigger>
                  <SelectContent>
                    {strategies.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>执行结果</Label>
                <Select
                  value={filter.result || ''}
                  onValueChange={(value) =>
                    setFilter({ ...filter, result: value || undefined, page: 1 })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="全部结果" />
                  </SelectTrigger>
                  <SelectContent>
                    {results.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>每页数量</Label>
                <Select
                  value={filter.pageSize?.toString() || '20'}
                  onValueChange={(value) =>
                    setFilter({ ...filter, pageSize: parseInt(value), page: 1 })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="20">20</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Logs Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]">ID</TableHead>
                <TableHead>时间</TableHead>
                <TableHead>容器</TableHead>
                <TableHead>策略</TableHead>
                <TableHead>动作</TableHead>
                <TableHead>结果</TableHead>
                <TableHead>耗时</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    {loading ? '加载中...' : '暂无日志'}
                  </TableCell>
                </TableRow>
              ) : (
                logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="font-mono text-xs">{log.id}</TableCell>
                    <TableCell className="text-sm">{formatDate(log.createdAt)}</TableCell>
                    <TableCell className="font-mono text-xs">{log.containerId}</TableCell>
                    <TableCell><StrategyBadge strategy={log.strategyType} /></TableCell>
                    <TableCell className="max-w-[200px] truncate text-sm">{log.action}</TableCell>
                    <TableCell><ResultBadge result={log.result} /></TableCell>
                    <TableCell className="text-sm">{formatDuration(log.duration)}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedLog(log)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            共 {total} 条记录，第 {filter.page} / {totalPages} 页
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={filter.page === 1}
              onClick={() => handlePageChange((filter.page || 1) - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={filter.page === totalPages}
              onClick={() => handlePageChange((filter.page || 1) + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Log Detail Dialog */}
      <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>日志详情 #{selectedLog?.id}</DialogTitle>
            <DialogDescription>
              {selectedLog && formatDate(selectedLog.createdAt)}
            </DialogDescription>
          </DialogHeader>
          {selectedLog && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">容器 ID</Label>
                  <p className="font-mono">{selectedLog.containerId}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">会话 ID</Label>
                  <p className="font-mono text-sm">{selectedLog.sessionId}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">策略类型</Label>
                  <p><StrategyBadge strategy={selectedLog.strategyType} /></p>
                </div>
                <div>
                  <Label className="text-muted-foreground">执行结果</Label>
                  <p><ResultBadge result={selectedLog.result} /></p>
                </div>
                <div>
                  <Label className="text-muted-foreground">耗时</Label>
                  <p>{formatDuration(selectedLog.duration)}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">触发原因</Label>
                  <p className="text-sm">{selectedLog.triggerReason}</p>
                </div>
              </div>
              <div>
                <Label className="text-muted-foreground">执行动作</Label>
                <p className="mt-1 p-2 bg-muted rounded text-sm">{selectedLog.action}</p>
              </div>
              {selectedLog.errorMessage && (
                <div>
                  <Label className="text-muted-foreground text-destructive">错误信息</Label>
                  <p className="mt-1 p-2 bg-destructive/10 text-destructive rounded text-sm">
                    {selectedLog.errorMessage}
                  </p>
                </div>
              )}
              {selectedLog.contextSnapshot && (
                <div>
                  <Label className="text-muted-foreground">上下文快照</Label>
                  <pre className="mt-1 p-2 bg-muted rounded text-xs overflow-x-auto max-h-[200px]">
                    {selectedLog.contextSnapshot}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default AutomationLogs;
