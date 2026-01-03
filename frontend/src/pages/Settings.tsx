import { useState, useEffect } from 'react'
import { Card, Form, Input, Button, message, Tabs, Alert } from 'antd'
import { settingsApi } from '../services/api'

const { TextArea } = Input

export default function Settings() {
  const [githubForm] = Form.useForm()
  const [claudeForm] = Form.useForm()
  const [githubConfigured, setGithubConfigured] = useState(false)
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
        claudeForm.setFieldsValue({
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
    custom_env_vars?: string
    startup_command?: string
  }) => {
    setSavingClaude(true)
    try {
      await settingsApi.saveClaudeConfig(values)
      message.success('Configuration saved successfully')
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } }
      message.error(err.response?.data?.error || 'Failed to save configuration')
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
              extra="Create a token at GitHub Settings > Developer settings > Personal access tokens. Required scopes: repo"
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
      key: 'environment',
      label: 'Environment Variables',
      children: (
        <Card>
          <Alert
            message="Environment Variables"
            description="These environment variables will be injected into all containers. Include your API keys and other configuration here."
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />
          <Form form={claudeForm} onFinish={handleSaveClaude} layout="vertical">
            <Form.Item
              name="custom_env_vars"
              label="Environment Variables"
              extra="One per line in VAR_NAME=value format. Example: ANTHROPIC_API_KEY=sk-ant-xxx"
            >
              <TextArea
                rows={10}
                placeholder={`# API Keys
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxx
OPENAI_API_KEY=sk-xxxxxxxxxxxx

# Custom Configuration
MY_CUSTOM_VAR=value
DEBUG=true`}
                style={{ fontFamily: 'monospace' }}
              />
            </Form.Item>
            <Form.Item
              name="startup_command"
              label="Claude Code Startup Command"
              extra="Command to run Claude Code for environment initialization"
            >
              <Input 
                placeholder="claude --dangerously-skip-permissions" 
                style={{ fontFamily: 'monospace' }}
              />
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
