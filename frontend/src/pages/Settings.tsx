import { useState, useEffect } from 'react'
import { Card, Form, Input, Button, message, Tabs, Space, Alert } from 'antd'
import { settingsApi } from '../services/api'

const { TextArea } = Input

interface ClaudeConfig {
  has_api_key: boolean
  api_url: string
  custom_env_vars: string
  startup_command: string
}

export default function Settings() {
  const [githubForm] = Form.useForm()
  const [claudeForm] = Form.useForm()
  const [githubConfigured, setGithubConfigured] = useState(false)
  const [claudeConfig, setClaudeConfig] = useState<ClaudeConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [savingGithub, setSavingGithub] = useState(false)
  const [savingClaude, setSavingClaude] = useState(false)

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const [githubRes, claudeRes] = await Promise.all([
          settingsApi.getGitHubConfig(),
          settingsApi.getClaudeConfig(),
        ])
        setGithubConfigured(githubRes.data.configured)
        setClaudeConfig(claudeRes.data)
        claudeForm.setFieldsValue({
          api_url: claudeRes.data.api_url,
          custom_env_vars: claudeRes.data.custom_env_vars,
          startup_command: claudeRes.data.startup_command || 'claude --dangerously-skip-permissions',
        })
      } catch (error) {
        message.error('Failed to load settings')
      } finally {
        setLoading(false)
      }
    }
    fetchSettings()
  }, [claudeForm])

  const handleSaveGithub = async (values: { token: string }) => {
    setSavingGithub(true)
    try {
      await settingsApi.saveGitHubToken(values.token)
      message.success('GitHub token saved successfully')
      setGithubConfigured(true)
      githubForm.resetFields()
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } }
      message.error(err.response?.data?.error || 'Failed to save GitHub token')
    } finally {
      setSavingGithub(false)
    }
  }

  const handleSaveClaude = async (values: {
    api_key?: string
    api_url?: string
    custom_env_vars?: string
    startup_command?: string
  }) => {
    setSavingClaude(true)
    try {
      await settingsApi.saveClaudeConfig(values)
      message.success('Claude configuration saved successfully')
      // Refresh config
      const res = await settingsApi.getClaudeConfig()
      setClaudeConfig(res.data)
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } }
      message.error(err.response?.data?.error || 'Failed to save Claude configuration')
    } finally {
      setSavingClaude(false)
    }
  }

  const items = [
    {
      key: 'github',
      label: 'GitHub',
      children: (
        <Card>
          {githubConfigured && (
            <Alert
              message="GitHub token is configured"
              type="success"
              showIcon
              style={{ marginBottom: 16 }}
            />
          )}
          <Form form={githubForm} onFinish={handleSaveGithub} layout="vertical">
            <Form.Item
              name="token"
              label="Personal Access Token"
              rules={[{ required: true, message: 'Please enter your GitHub token' }]}
              extra="Create a token at GitHub Settings > Developer settings > Personal access tokens"
            >
              <Input.Password placeholder="ghp_xxxxxxxxxxxx" />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit" loading={savingGithub}>
                {githubConfigured ? 'Update Token' : 'Save Token'}
              </Button>
            </Form.Item>
          </Form>
        </Card>
      ),
    },
    {
      key: 'claude',
      label: 'Claude Code',
      children: (
        <Card>
          {claudeConfig?.has_api_key && (
            <Alert
              message="Claude API key is configured"
              type="success"
              showIcon
              style={{ marginBottom: 16 }}
            />
          )}
          <Form form={claudeForm} onFinish={handleSaveClaude} layout="vertical">
            <Form.Item
              name="api_key"
              label="API Key"
              extra="Leave empty to keep existing key"
            >
              <Input.Password placeholder="sk-ant-xxxxxxxxxxxx" />
            </Form.Item>
            <Form.Item
              name="api_url"
              label="API URL (Optional)"
              extra="Custom API endpoint URL (e.g., for proxy or alternative providers)"
            >
              <Input placeholder="https://api.anthropic.com" />
            </Form.Item>
            <Form.Item
              name="custom_env_vars"
              label="Custom Environment Variables"
              extra="One per line in VAR_NAME=value format"
            >
              <TextArea
                rows={4}
                placeholder="MY_VAR=value&#10;ANOTHER_VAR=another_value"
              />
            </Form.Item>
            <Form.Item
              name="startup_command"
              label="Startup Command"
              extra="Command to run when starting Claude Code"
            >
              <Input placeholder="claude --dangerously-skip-permissions" />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit" loading={savingClaude}>
                Save Configuration
              </Button>
            </Form.Item>
          </Form>
        </Card>
      ),
    },
  ]

  if (loading) {
    return <div>Loading...</div>
  }

  return (
    <div>
      <h2 style={{ marginBottom: 16 }}>Settings</h2>
      <Tabs items={items} />
    </div>
  )
}
