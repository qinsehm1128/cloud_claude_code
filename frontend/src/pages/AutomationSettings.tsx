import { useState, useEffect } from 'react';
import { Save, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Separator } from '@/components/ui/separator';

export interface GlobalAutomationConfig {
  // General settings
  defaultSilenceThreshold: number;
  defaultStrategy: string;
  enableByDefault: boolean;
  
  // Webhook settings
  webhookUrl: string;
  webhookTimeout: number;
  webhookRetryCount: number;
  webhookHeaders: string;
  
  // Injection settings
  injectionCommand: string;
  injectionDelay: number;
  
  // Queue settings
  userPromptTemplate: string;
  queueEmptyNotification: boolean;
  
  // AI settings
  aiEndpoint: string;
  aiApiKey: string;
  aiModel: string;
  aiTimeout: number;
  aiSystemPrompt: string;
  aiFallbackStrategy: string;
}

const defaultConfig: GlobalAutomationConfig = {
  defaultSilenceThreshold: 30,
  defaultStrategy: 'webhook',
  enableByDefault: false,
  webhookUrl: '',
  webhookTimeout: 10,
  webhookRetryCount: 3,
  webhookHeaders: '{}',
  injectionCommand: '',
  injectionDelay: 0,
  userPromptTemplate: '请继续执行以下任务:',
  queueEmptyNotification: true,
  aiEndpoint: '',
  aiApiKey: '',
  aiModel: 'gpt-4',
  aiTimeout: 30,
  aiSystemPrompt: '',
  aiFallbackStrategy: 'webhook',
};

const strategies = [
  { value: 'webhook', label: 'Webhook 通知' },
  { value: 'injection', label: '命令注入' },
  { value: 'queue', label: '任务队列' },
  { value: 'ai', label: 'AI 决策' },
];

export function AutomationSettings() {
  const [config, setConfig] = useState<GlobalAutomationConfig>(defaultConfig);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load config on mount
  useEffect(() => {
    // TODO: Load from API when implemented
    const savedConfig = localStorage.getItem('automation_config');
    if (savedConfig) {
      try {
        setConfig({ ...defaultConfig, ...JSON.parse(savedConfig) });
      } catch {
        // Ignore parse errors
      }
    }
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);

    try {
      // Validate config
      if (config.defaultSilenceThreshold < 5 || config.defaultSilenceThreshold > 300) {
        throw new Error('静默阈值必须在 5-300 秒之间');
      }
      if (config.webhookRetryCount < 0 || config.webhookRetryCount > 10) {
        throw new Error('重试次数必须在 0-10 之间');
      }
      if (config.webhookHeaders) {
        try {
          JSON.parse(config.webhookHeaders);
        } catch {
          throw new Error('Webhook Headers 必须是有效的 JSON');
        }
      }

      // TODO: Save to API when implemented
      localStorage.setItem('automation_config', JSON.stringify(config));
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setConfig(defaultConfig);
  };

  return (
    <div className="container max-w-4xl py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">自动化设置</h1>
          <p className="text-muted-foreground">配置 PTY 监控和自动化策略</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleReset}>
            <RefreshCw className="h-4 w-4 mr-2" />
            重置
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : saved ? (
              <CheckCircle2 className="h-4 w-4 mr-2 text-green-500" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            {saved ? '已保存' : '保存'}
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-4 text-destructive bg-destructive/10 rounded-md">
          <AlertCircle className="h-5 w-5" />
          {error}
        </div>
      )}

      {/* General Settings */}
      <Card>
        <CardHeader>
          <CardTitle>通用设置</CardTitle>
          <CardDescription>配置默认的监控行为</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between">
              <Label>默认静默阈值</Label>
              <span className="text-sm text-muted-foreground">
                {config.defaultSilenceThreshold}s
              </span>
            </div>
            <Slider
              value={[config.defaultSilenceThreshold]}
              onValueChange={(values: number[]) =>
                setConfig({ ...config, defaultSilenceThreshold: values[0] })
              }
              min={5}
              max={300}
              step={5}
            />
            <p className="text-xs text-muted-foreground">
              无输出超过此时间后触发策略 (5-300秒)
            </p>
          </div>

          <div className="space-y-2">
            <Label>默认策略</Label>
            <Select
              value={config.defaultStrategy}
              onValueChange={(value) =>
                setConfig({ ...config, defaultStrategy: value })
              }
            >
              <SelectTrigger>
                <SelectValue />
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
        </CardContent>
      </Card>

      {/* Webhook Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Webhook 设置</CardTitle>
          <CardDescription>配置 Webhook 通知策略</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Webhook URL</Label>
            <Input
              value={config.webhookUrl}
              onChange={(e) =>
                setConfig({ ...config, webhookUrl: e.target.value })
              }
              placeholder="https://example.com/webhook"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>超时时间 (秒)</Label>
              <Input
                type="number"
                value={config.webhookTimeout}
                onChange={(e) =>
                  setConfig({ ...config, webhookTimeout: parseInt(e.target.value) || 10 })
                }
                min={1}
                max={60}
              />
            </div>
            <div className="space-y-2">
              <Label>重试次数</Label>
              <Input
                type="number"
                value={config.webhookRetryCount}
                onChange={(e) =>
                  setConfig({ ...config, webhookRetryCount: parseInt(e.target.value) || 3 })
                }
                min={0}
                max={10}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>自定义 Headers (JSON)</Label>
            <Textarea
              value={config.webhookHeaders}
              onChange={(e) =>
                setConfig({ ...config, webhookHeaders: e.target.value })
              }
              placeholder='{"Authorization": "Bearer xxx"}'
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      {/* Injection Settings */}
      <Card>
        <CardHeader>
          <CardTitle>命令注入设置</CardTitle>
          <CardDescription>配置命令注入策略</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>注入命令</Label>
            <Input
              value={config.injectionCommand}
              onChange={(e) =>
                setConfig({ ...config, injectionCommand: e.target.value })
              }
              placeholder="echo 'continue'"
            />
            <p className="text-xs text-muted-foreground">
              支持占位符: {'{container_id}'}, {'{session_id}'}, {'{timestamp}'}, {'{context}'}
            </p>
          </div>

          <div className="space-y-2">
            <Label>注入延迟 (毫秒)</Label>
            <Input
              type="number"
              value={config.injectionDelay}
              onChange={(e) =>
                setConfig({ ...config, injectionDelay: parseInt(e.target.value) || 0 })
              }
              min={0}
              max={5000}
            />
          </div>
        </CardContent>
      </Card>

      {/* Queue Settings */}
      <Card>
        <CardHeader>
          <CardTitle>任务队列设置</CardTitle>
          <CardDescription>配置任务队列策略</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>提示词模板</Label>
            <Textarea
              value={config.userPromptTemplate}
              onChange={(e) =>
                setConfig({ ...config, userPromptTemplate: e.target.value })
              }
              placeholder="请继续执行以下任务:"
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              任务内容将追加到此模板后面
            </p>
          </div>
        </CardContent>
      </Card>

      <Separator />

      {/* AI Settings */}
      <Card>
        <CardHeader>
          <CardTitle>AI 策略设置</CardTitle>
          <CardDescription>配置 AI 决策策略 (OpenAI 兼容 API)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>API 端点</Label>
            <Input
              value={config.aiEndpoint}
              onChange={(e) =>
                setConfig({ ...config, aiEndpoint: e.target.value })
              }
              placeholder="https://api.openai.com/v1"
            />
          </div>

          <div className="space-y-2">
            <Label>API Key</Label>
            <Input
              type="password"
              value={config.aiApiKey}
              onChange={(e) =>
                setConfig({ ...config, aiApiKey: e.target.value })
              }
              placeholder="sk-..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>模型</Label>
              <Input
                value={config.aiModel}
                onChange={(e) =>
                  setConfig({ ...config, aiModel: e.target.value })
                }
                placeholder="gpt-4"
              />
            </div>
            <div className="space-y-2">
              <Label>超时时间 (秒)</Label>
              <Input
                type="number"
                value={config.aiTimeout}
                onChange={(e) =>
                  setConfig({ ...config, aiTimeout: parseInt(e.target.value) || 30 })
                }
                min={5}
                max={120}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>系统提示词</Label>
            <Textarea
              value={config.aiSystemPrompt}
              onChange={(e) =>
                setConfig({ ...config, aiSystemPrompt: e.target.value })
              }
              placeholder="你是一个编程助手，负责分析终端输出并决定下一步操作..."
              rows={4}
            />
          </div>

          <div className="space-y-2">
            <Label>失败回退策略</Label>
            <Select
              value={config.aiFallbackStrategy}
              onValueChange={(value) =>
                setConfig({ ...config, aiFallbackStrategy: value })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {strategies.filter(s => s.value !== 'ai').map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              AI 请求失败时使用的备用策略
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default AutomationSettings;
