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
  userPromptTemplate: 'Please continue with the following task:',
  queueEmptyNotification: true,
  aiEndpoint: '',
  aiApiKey: '',
  aiModel: 'gpt-4',
  aiTimeout: 30,
  aiSystemPrompt: '',
  aiFallbackStrategy: 'webhook',
};

const strategies = [
  { value: 'webhook', label: 'Webhook Notification' },
  { value: 'injection', label: 'Command Injection' },
  { value: 'queue', label: 'Task Queue' },
  { value: 'ai', label: 'AI Decision' },
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
        throw new Error('Silence threshold must be between 5-300 seconds');
      }
      if (config.webhookRetryCount < 0 || config.webhookRetryCount > 10) {
        throw new Error('Retry count must be between 0-10');
      }
      if (config.webhookHeaders) {
        try {
          JSON.parse(config.webhookHeaders);
        } catch {
          throw new Error('Webhook Headers must be valid JSON');
        }
      }

      // TODO: Save to API when implemented
      localStorage.setItem('automation_config', JSON.stringify(config));
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
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
          <h1 className="text-2xl font-bold">Automation Settings</h1>
          <p className="text-muted-foreground">Configure PTY monitoring and automation strategies</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleReset}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Reset
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : saved ? (
              <CheckCircle2 className="h-4 w-4 mr-2 text-green-500" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            {saved ? 'Saved' : 'Save'}
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
          <CardTitle>General Settings</CardTitle>
          <CardDescription>Configure default monitoring behavior</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between">
              <Label>Default Silence Threshold</Label>
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
              Trigger strategy after no output for this duration (5-300 seconds)
            </p>
          </div>

          <div className="space-y-2">
            <Label>Default Strategy</Label>
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
          <CardTitle>Webhook Settings</CardTitle>
          <CardDescription>Configure webhook notification strategy</CardDescription>
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
              <Label>Timeout (seconds)</Label>
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
              <Label>Retry Count</Label>
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
            <Label>Custom Headers (JSON)</Label>
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
          <CardTitle>Command Injection Settings</CardTitle>
          <CardDescription>Configure command injection strategy</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Injection Command</Label>
            <Input
              value={config.injectionCommand}
              onChange={(e) =>
                setConfig({ ...config, injectionCommand: e.target.value })
              }
              placeholder="echo 'continue'"
            />
            <p className="text-xs text-muted-foreground">
              Supports placeholders: {'{container_id}'}, {'{session_id}'}, {'{timestamp}'}, {'{context}'}
            </p>
          </div>

          <div className="space-y-2">
            <Label>Injection Delay (ms)</Label>
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

      {/* Queue Settings - Hidden for now, configure in task panel instead */}
      {/* <Card>
        <CardHeader>
          <CardTitle>Task Queue Settings</CardTitle>
          <CardDescription>Configure task queue strategy</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Prompt Template</Label>
            <Textarea
              value={config.userPromptTemplate}
              onChange={(e) =>
                setConfig({ ...config, userPromptTemplate: e.target.value })
              }
              placeholder="Please continue with the following task:"
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              Task content will be appended after this template
            </p>
          </div>
        </CardContent>
      </Card> */}

      <Separator />

      {/* AI Settings */}
      <Card>
        <CardHeader>
          <CardTitle>AI Strategy Settings</CardTitle>
          <CardDescription>Configure AI decision strategy (OpenAI compatible API)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>API Endpoint</Label>
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
              <Label>Model</Label>
              <Input
                value={config.aiModel}
                onChange={(e) =>
                  setConfig({ ...config, aiModel: e.target.value })
                }
                placeholder="gpt-4"
              />
            </div>
            <div className="space-y-2">
              <Label>Timeout (seconds)</Label>
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
            <Label>System Prompt</Label>
            <Textarea
              value={config.aiSystemPrompt}
              onChange={(e) =>
                setConfig({ ...config, aiSystemPrompt: e.target.value })
              }
              placeholder="You are a programming assistant responsible for analyzing terminal output and deciding the next action..."
              rows={4}
            />
          </div>

          <div className="space-y-2">
            <Label>Fallback Strategy</Label>
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
              Fallback strategy when AI request fails
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default AutomationSettings;
