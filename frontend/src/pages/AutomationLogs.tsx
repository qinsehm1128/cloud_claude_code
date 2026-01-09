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
  { value: 'all', label: 'All Strategies' },
  { value: 'webhook', label: 'Webhook' },
  { value: 'injection', label: 'Injection' },
  { value: 'queue', label: 'Queue' },
  { value: 'ai', label: 'AI' },
];

const results = [
  { value: 'all', label: 'All Results' },
  { value: 'success', label: 'Success' },
  { value: 'failed', label: 'Failed' },
  { value: 'skipped', label: 'Skipped' },
];

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleString('en-US', {
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
    injection: 'Injection',
    queue: 'Queue',
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
      alert(`Deleted ${result.deleted_count} logs`);
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
          <h1 className="text-2xl font-bold">Automation Logs</h1>
          <p className="text-muted-foreground">View and manage automation execution records</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowFilters(!showFilters)}>
            <Filter className="h-4 w-4 mr-2" />
            Filter
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Trash2 className="h-4 w-4 mr-2" />
                Cleanup
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Cleanup Old Logs</AlertDialogTitle>
                <AlertDialogDescription>
                  Choose how many days of logs to keep. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => handleCleanup(7)}>7 days</AlertDialogAction>
                <AlertDialogAction onClick={() => handleCleanup(30)}>30 days</AlertDialogAction>
                <AlertDialogAction onClick={() => handleCleanup(90)}>90 days</AlertDialogAction>
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
              <CardDescription>Total Logs</CardDescription>
              <CardTitle className="text-2xl">{stats.total_count}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Last 24 Hours</CardDescription>
              <CardTitle className="text-2xl">{stats.recent_count}</CardTitle>
            </CardHeader>
          </Card>
          {stats.strategy_stats?.slice(0, 2).map((s) => (
            <Card key={s.strategy_type}>
              <CardHeader className="pb-2">
                <CardDescription>{s.strategy_type} Success Rate</CardDescription>
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
            <CardTitle className="text-lg">Filters</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>Container ID</Label>
                <Input
                  type="number"
                  placeholder="All"
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
                <Label>Strategy Type</Label>
                <Select
                  value={filter.strategy || 'all'}
                  onValueChange={(value) =>
                    setFilter({ ...filter, strategy: value === 'all' ? undefined : value, page: 1 })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All Strategies" />
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
                <Label>Result</Label>
                <Select
                  value={filter.result || 'all'}
                  onValueChange={(value) =>
                    setFilter({ ...filter, result: value === 'all' ? undefined : value, page: 1 })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All Results" />
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
                <Label>Page Size</Label>
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
                <TableHead>Time</TableHead>
                <TableHead>Container</TableHead>
                <TableHead>Strategy</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Result</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    {loading ? 'Loading...' : 'No logs found'}
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
            Total {total} records, Page {filter.page} / {totalPages}
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
            <DialogTitle>Log Details #{selectedLog?.id}</DialogTitle>
            <DialogDescription>
              {selectedLog && formatDate(selectedLog.createdAt)}
            </DialogDescription>
          </DialogHeader>
          {selectedLog && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Container ID</Label>
                  <p className="font-mono">{selectedLog.containerId}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Session ID</Label>
                  <p className="font-mono text-sm">{selectedLog.sessionId}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Strategy Type</Label>
                  <p><StrategyBadge strategy={selectedLog.strategyType} /></p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Result</Label>
                  <p><ResultBadge result={selectedLog.result} /></p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Duration</Label>
                  <p>{formatDuration(selectedLog.duration)}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Trigger Reason</Label>
                  <p className="text-sm">{selectedLog.triggerReason}</p>
                </div>
              </div>
              <div>
                <Label className="text-muted-foreground">Action</Label>
                <p className="mt-1 p-2 bg-muted rounded text-sm">{selectedLog.action}</p>
              </div>
              {selectedLog.errorMessage && (
                <div>
                  <Label className="text-muted-foreground text-destructive">Error Message</Label>
                  <p className="mt-1 p-2 bg-destructive/10 text-destructive rounded text-sm">
                    {selectedLog.errorMessage}
                  </p>
                </div>
              )}
              {selectedLog.contextSnapshot && (
                <div>
                  <Label className="text-muted-foreground">Context Snapshot</Label>
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
