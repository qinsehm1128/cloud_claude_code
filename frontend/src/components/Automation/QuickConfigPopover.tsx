import { useState, ReactNode } from 'react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Settings } from 'lucide-react';

export interface MonitoringConfig {
  silenceThreshold: number;
  activeStrategy: string;
  webhookUrl?: string;
  injectionCommand?: string;
  userPromptTemplate?: string;
}

interface QuickConfigPopoverProps {
  config: MonitoringConfig;
  onSave: (config: MonitoringConfig) => void;
  children?: ReactNode;
}

const strategies = [
  { value: 'webhook', label: 'Webhook Notification' },
  { value: 'injection', label: 'Command Injection' },
  { value: 'queue', label: 'Task Queue' },
  { value: 'ai', label: 'AI Decision' },
];

export function QuickConfigPopover({
  config,
  onSave,
  children,
}: QuickConfigPopoverProps) {
  const [localConfig, setLocalConfig] = useState<MonitoringConfig>(config);
  const [open, setOpen] = useState(false);

  const handleSave = () => {
    onSave(localConfig);
    setOpen(false);
  };

  const handleStrategyChange = (value: string) => {
    setLocalConfig({ ...localConfig, activeStrategy: value });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {children || (
          <Button variant="ghost" size="sm">
            <Settings className="h-4 w-4" />
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <div className="space-y-4">
          <h4 className="font-medium">Quick Config</h4>

          {/* Silence threshold */}
          <div className="space-y-2">
            <div className="flex justify-between">
              <Label>Silence Threshold</Label>
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
              Trigger strategy after no output for this duration (5-300s)
            </p>
          </div>

          {/* Strategy selection */}
          <div className="space-y-2">
            <Label>Strategy</Label>
            <Select
              value={localConfig.activeStrategy}
              onValueChange={handleStrategyChange}
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

          {/* Strategy-specific config */}
          {localConfig.activeStrategy === 'webhook' && (
            <div className="space-y-2">
              <Label>Webhook URL</Label>
              <Input
                value={localConfig.webhookUrl || ''}
                onChange={(e) =>
                  setLocalConfig({ ...localConfig, webhookUrl: e.target.value })
                }
                placeholder="https://example.com/webhook"
              />
            </div>
          )}

          {localConfig.activeStrategy === 'injection' && (
            <div className="space-y-2">
              <Label>Injection Command</Label>
              <Input
                value={localConfig.injectionCommand || ''}
                onChange={(e) =>
                  setLocalConfig({
                    ...localConfig,
                    injectionCommand: e.target.value,
                  })
                }
                placeholder="echo 'continue'"
              />
              <p className="text-xs text-muted-foreground">
                Supports placeholders: {'{container_id}'}, {'{session_id}'}, {'{timestamp}'}
              </p>
            </div>
          )}

          {localConfig.activeStrategy === 'queue' && (
            <div className="space-y-2">
              <Label>Prompt Template</Label>
              <Input
                value={localConfig.userPromptTemplate || ''}
                onChange={(e) =>
                  setLocalConfig({
                    ...localConfig,
                    userPromptTemplate: e.target.value,
                  })
                }
                placeholder="Please continue with the following task:"
              />
            </div>
          )}

          {/* Save button */}
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave}>
              Save
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default QuickConfigPopover;
