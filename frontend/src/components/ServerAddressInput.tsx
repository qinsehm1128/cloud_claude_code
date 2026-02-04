/**
 * ServerAddressInput Component
 *
 * A component for inputting and validating server addresses with connection testing.
 *
 * Requirements: 1.1, 1.2, 1.3, 5.2, 5.3, 5.4
 */

import { Loader2, CheckCircle2, XCircle } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

/**
 * Props for the ServerAddressInput component
 */
export interface ServerAddressInputProps {
  /** Current value of the server address input */
  value: string
  /** Callback when the input value changes */
  onChange: (value: string) => void
  /** Error message to display below the input */
  error?: string
  /** Callback when the test connection button is clicked */
  onTestConnection?: () => void
  /** Whether a connection test is currently in progress */
  isTestingConnection?: boolean
  /** Current connection status */
  connectionStatus?: 'idle' | 'success' | 'error'
}

/**
 * ServerAddressInput component for entering and testing server addresses
 *
 * Features:
 * - Input field with placeholder showing expected format
 * - Error message display below input
 * - Test connection button with loading state
 * - Connection status indicators (success: green checkmark, error: red X, loading: spinner)
 *
 * @param props - Component props
 * @returns JSX element
 */
export function ServerAddressInput({
  value,
  onChange,
  error,
  onTestConnection,
  isTestingConnection = false,
  connectionStatus = 'idle',
}: ServerAddressInputProps): JSX.Element {
  return (
    <div className="space-y-2">
      <Label htmlFor="server-address">服务器地址</Label>
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Input
            id="server-address"
            type="text"
            placeholder="http://localhost:8080"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={error ? 'border-destructive' : ''}
            aria-invalid={!!error}
            aria-describedby={error ? 'server-address-error' : undefined}
          />
          {/* Connection status indicator inside input */}
          {connectionStatus !== 'idle' && !isTestingConnection && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              {connectionStatus === 'success' && (
                <CheckCircle2 className="h-4 w-4 text-green-500" aria-label="连接成功" />
              )}
              {connectionStatus === 'error' && (
                <XCircle className="h-4 w-4 text-destructive" aria-label="连接失败" />
              )}
            </div>
          )}
        </div>
        {onTestConnection && (
          <Button
            type="button"
            variant="outline"
            onClick={onTestConnection}
            disabled={isTestingConnection}
            aria-label={isTestingConnection ? '正在测试连接' : '测试连接'}
          >
            {isTestingConnection ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                测试中
              </>
            ) : (
              '测试连接'
            )}
          </Button>
        )}
      </div>
      {error && (
        <p
          id="server-address-error"
          className="text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      )}
    </div>
  )
}

export default ServerAddressInput
