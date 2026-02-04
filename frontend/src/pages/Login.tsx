/**
 * Login Page Component
 *
 * Provides user authentication with dynamic server address configuration.
 *
 * Requirements: 1.1, 1.4, 2.4, 3.1, 3.2, 5.1, 5.2, 5.3, 5.4
 */

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Terminal, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { authApi } from '@/services/api'
import { ServerAddressInput } from '@/components/ServerAddressInput'
import {
  getServerAddress,
  setServerAddress,
  validateAddress,
  testConnection,
} from '@/services/serverAddressManager'

export default function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  // Server address state management
  const [serverAddress, setServerAddressState] = useState('')
  const [serverAddressError, setServerAddressError] = useState('')
  const [isTestingConnection, setIsTestingConnection] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'success' | 'error'>('idle')

  // Load saved server address on mount (Requirement 1.4, 3.2)
  useEffect(() => {
    const savedAddress = getServerAddress()
    if (savedAddress) {
      setServerAddressState(savedAddress)
    }
  }, [])

  /**
   * Handle server address change
   * Validates the address and updates state
   */
  const handleServerAddressChange = (value: string) => {
    setServerAddressState(value)
    // Reset connection status when address changes
    setConnectionStatus('idle')
    // Clear error when user starts typing
    if (serverAddressError) {
      setServerAddressError('')
    }
  }

  /**
   * Handle connection test (Requirements 5.1, 5.2, 5.3, 5.4)
   */
  const handleTestConnection = async () => {
    // Validate address first
    const validation = validateAddress(serverAddress)
    if (!validation.isValid) {
      setServerAddressError(validation.error || '服务器地址格式无效')
      setConnectionStatus('error')
      return
    }

    setIsTestingConnection(true)
    setServerAddressError('')
    setConnectionStatus('idle')

    try {
      const result = await testConnection(serverAddress)
      if (result.success) {
        setConnectionStatus('success')
      } else {
        setConnectionStatus('error')
        setServerAddressError(result.error || '连接失败')
      }
    } catch {
      setConnectionStatus('error')
      setServerAddressError('连接测试失败')
    } finally {
      setIsTestingConnection(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setServerAddressError('')

    // Validate server address before login (Requirement 2.4)
    const validation = validateAddress(serverAddress)
    if (!validation.isValid) {
      setServerAddressError(validation.error || '服务器地址格式无效')
      setLoading(false)
      return
    }

    // Set server address before making API call so it uses the correct baseURL
    if (serverAddress) {
      setServerAddress(serverAddress)
    }

    try {
      // Login - server sets httpOnly cookie automatically
      await authApi.login(username, password)

      // Save server address on successful login (Requirement 3.1)
      if (serverAddress) {
        setServerAddress(serverAddress)
      }

      navigate('/')
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } }
      setError(error.response?.data?.error || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">
            <div className="flex items-center gap-2">
              <Terminal className="h-8 w-8" />
              <span className="text-2xl font-bold">Claude Code</span>
            </div>
          </div>
          <CardTitle className="text-2xl">Welcome back</CardTitle>
          <CardDescription>
            Enter your credentials to access your containers
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">
                {error}
              </div>
            )}

            {/* Server Address Input - above username field (Requirement 1.1) */}
            <ServerAddressInput
              value={serverAddress}
              onChange={handleServerAddressChange}
              error={serverAddressError}
              onTestConnection={handleTestConnection}
              isTestingConnection={isTestingConnection}
              connectionStatus={connectionStatus}
            />

            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                type="text"
                placeholder="admin"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Sign in
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
