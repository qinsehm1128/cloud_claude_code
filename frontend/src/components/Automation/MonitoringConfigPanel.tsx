import { useState, useEffect } from 'react';
import { Save, Webhook, Terminal, ListTodo, Bot } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export interface MonitoringConfig {
  silenceThreshold: number;
  activeStrategy: string;
  webhookUrl?: string;
  webhookHeaders?: string;
  injectionCommand?: string;
  userPromptTemplate?: string;
  aiEndpoint?: string;
  aiApiKey?: string;
  aiModel?: string;
  aiSystemPrompt?: string;
  aiTemperature?: number;
}

interface MonitoringConfigPanelProps {
  config: MonitoringConfig;
  onSave: (config: MonitoringConfig) => void;
  onClose?: () => void;
  className?: string;
}

const strategies = [
  {
    value: 'webhook',
    label: 'Webhook',
    description: 'Send HTTP notification',
    icon: <Webhook className="h-4 w-4" />,
    color: 'bg-blue-500',
  },
  {
    value: 'injection',
    label: 'Injection',
    description: 'Inject command',
    icon: <Terminal className="h-4 w-4" />,
    color: 'bg-green-500',
  },
  {
    value: 'queue',
    label: 'Queue',
    description: 'Execute task queue',
    icon: <ListTodo className="h-4 w-4" />,
    color: 'bg-purple-500',
  },
  {
    value: 'ai',
    label: 'AI',
    description: 'AI decision',
    icon: <Bot className="h-4 w-4" />,
    color: 'bg-orange-500',
  },
];

export function MonitoringConfigPanel({
  config,
  onSave,
  className,
}: MonitoringConfigPanelProps) {
  const [localConfig, setLocalConfig] = useState<MonitoringConfig>(config);

  useEffect(() => {
    setLocalConfig(config);
  }, [config]);

  const handleSave = () => {
    onSave(localConfig);
  };

  const selectedStrategy = strategies.find(s => s.value === localConfig.activeStrategy);

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Content */}
      <div className="flex-1 overflow-auto p-4 space-y-6">
        {/* Silence Threshold */}
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <Label className="text-sm font-medium">Silence Threshold</Label>
            <span className="text-sm text-muted-foreground">
              {localConfig.silenceThreshold}s
            </span>
          </div>
          <Slider
            value={[localConfig.silenceThreshold]}
            onValueChange={(values: number[]) =>
              setLocalConfig({ ...localConfig, silenceThreshold: values[0] })
            }
            min={5}
            max={300}
            step={5}
          />
          <p className="text-xs text-muted-foreground">
            Trigger automation after terminal is silent for this duration
          </p>
        </div>

        {/* Strategy Selection */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Strategy</Label>
          <div className="grid grid-cols-2 gap-2">
            {strategies.map((strategy) => (
              <button
                key={strategy.value}
                onClick={() =>
                  setLocalConfig({ ...localConfig, activeStrategy: strategy.value })
                }
                className={cn(
                  'flex items-center gap-2 p-3 rounded-lg border transition-all',
                  localConfig.activeStrategy === strategy.value
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'
                )}
              >
                <Badge variant="secondary" className={cn('p-1.5', strategy.color)}>
                  {strategy.icon}
                </Badge>
                <div className="text-left">
                  <div className="text-sm font-medium">{strategy.label}</div>
                  <div className="text-xs text-muted-foreground">{strategy.description}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Strategy-specific Configuration */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              {selectedStrategy && (
                <Badge variant="secondary" className={cn('p-1', selectedStrategy.color)}>
                  {selectedStrategy.icon}
                </Badge>
              )}
              {selectedStrategy?.label} Configuration
            </CardTitle>
            <CardDescription className="text-xs">
              Configure settings for the selected strategy
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {localConfig.activeStrategy === 'webhook' && (
              <>
                <div className="space-y-2">
                  <Label className="text-sm">Webhook URL</Label>
                  <Input
                    value={localConfig.webhookUrl || ''}
                    onChange={(e) =>
                      setLocalConfig({ ...localConfig, webhookUrl: e.target.value })
                    }
                    placeholder="https://example.com/webhook"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">Custom Headers (JSON)</Label>
                  <Textarea
                    value={localConfig.webhookHeaders || ''}
                    onChange={(e) =>
                      setLocalConfig({ ...localConfig, webhookHeaders: e.target.value })
                    }
                    placeholder='{"Authorization": "Bearer token"}'
                    rows={3}
                  />
                </div>
              </>
            )}

            {localConfig.activeStrategy === 'injection' && (
              <div className="space-y-2">
                <Label className="text-sm">Injection Command</Label>
                <Textarea
                  value={localConfig.injectionCommand || ''}
                  onChange={(e) =>
                    setLocalConfig({ ...localConfig, injectionCommand: e.target.value })
                  }
                  placeholder="echo 'continue'"
                  rows={3}
                />
                <p className="text-xs text-muted-foreground">
                  Placeholders: {'{container_id}'}, {'{session_id}'}, {'{timestamp}'}, {'{silence_duration}'}, {'{docker_id}'}
                </p>
              </div>
            )}

            {localConfig.activeStrategy === 'queue' && (
              <div className="space-y-2">
                <Label className="text-sm">Prompt Template</Label>
                <Textarea
                  value={localConfig.userPromptTemplate || ''}
                  onChange={(e) =>
                    setLocalConfig({ ...localConfig, userPromptTemplate: e.target.value })
                  }
                  placeholder="Please continue with the following task: {task}"
                  rows={3}
                />
                <p className="text-xs text-muted-foreground">
                  Use {'{task}'} as placeholder for the task content
                </p>
              </div>
            )}

            {localConfig.activeStrategy === 'ai' && (
              <>
                <div className="space-y-2">
                  <Label className="text-sm">AI Endpoint</Label>
                  <Input
                    value={localConfig.aiEndpoint || ''}
                    onChange={(e) =>
                      setLocalConfig({ ...localConfig, aiEndpoint: e.target.value })
                    }
                    placeholder="https://api.openai.com/v1"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">API Key</Label>
                  <Input
                    type="password"
                    value={localConfig.aiApiKey || ''}
                    onChange={(e) =>
                      setLocalConfig({ ...localConfig, aiApiKey: e.target.value })
                    }
                    placeholder="sk-..."
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">Model</Label>
                  <Input
                    value={localConfig.aiModel || ''}
                    onChange={(e) =>
                      setLocalConfig({ ...localConfig, aiModel: e.target.value })
                    }
                    placeholder="gpt-4"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">System Prompt</Label>
                  <Textarea
                    value={localConfig.aiSystemPrompt || ''}
                    onChange={(e) =>
                      setLocalConfig({ ...localConfig, aiSystemPrompt: e.target.value })
                    }
                    placeholder="You are an automation assistant..."
                    rows={4}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <Label className="text-sm">Temperature</Label>
                    <span className="text-sm text-muted-foreground">
                      {localConfig.aiTemperature || 0.7}
                    </span>
                  </div>
                  <Slider
                    value={[localConfig.aiTemperature || 0.7]}
                    onValueChange={(values: number[]) =>
                      setLocalConfig({ ...localConfig, aiTemperature: values[0] })
                    }
                    min={0}
                    max={2}
                    step={0.1}
                  />
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Save Button */}
        <Button onClick={handleSave} className="w-full">
          <Save className="h-4 w-4 mr-2" />
          Save Settings
        </Button>
      </div>
    </div>
  );
}

export default MonitoringConfigPanel;
