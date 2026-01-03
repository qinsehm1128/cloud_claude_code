import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Card,
  Row,
  Col,
  Button,
  Modal,
  Form,
  Input,
  Select,
  message,
  Tag,
  Space,
  Popconfirm,
  Empty,
  Spin,
  Progress,
  Typography,
  Timeline,
} from 'antd'
import {
  PlayCircleOutlined,
  PauseCircleOutlined,
  DeleteOutlined,
  PlusOutlined,
  CodeOutlined,
  SyncOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  LoadingOutlined,
  ReloadOutlined,
  FileTextOutlined,
  InfoCircleOutlined,
  WarningOutlined,
  CloseCircleFilled,
} from '@ant-design/icons'
import { containerApi, repoApi } from '../services/api'

const { Text } = Typography

interface Container {
  id: number
  docker_id: string
  name: string
  status: string
  init_status: string
  init_message?: string
  git_repo_url?: string
  git_repo_name?: string
  work_dir?: string
  created_at: string
  started_at?: string
  stopped_at?: string
  initialized_at?: string
}

interface RemoteRepository {
  id: number
  name: string
  full_name: string
  clone_url: string
  html_url: string
  private: boolean
}

interface ContainerLog {
  ID: number
  CreatedAt: string
  container_id: number
  level: string
  stage: string
  message: string
}

export default function Dashboard() {
  const [containers, setContainers] = useState<Container[]>([])
  const [remoteRepos, setRemoteRepos] = useState<RemoteRepository[]>([])
  const [loading, setLoading] = useState(true)
  const [modalVisible, setModalVisible] = useState(false)
  const [creating, setCreating] = useState(false)
  const [loadingRepos, setLoadingRepos] = useState(false)
  const [repoSource, setRepoSource] = useState<'select' | 'url'>('select')
  const [logModalVisible, setLogModalVisible] = useState(false)
  const [selectedContainerId, setSelectedContainerId] = useState<number | null>(null)
  const [logs, setLogs] = useState<ContainerLog[]>([])
  const [loadingLogs, setLoadingLogs] = useState(false)
  const [form] = Form.useForm()
  const navigate = useNavigate()

  const fetchContainers = useCallback(async () => {
    try {
      const response = await containerApi.list()
      setContainers(response.data)
    } catch (error) {
      message.error('Failed to fetch containers')
    }
  }, [])

  const fetchRemoteRepos = async () => {
    setLoadingRepos(true)
    try {
      const response = await repoApi.listRemote()
      setRemoteRepos(response.data || [])
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } }
      message.error(err.response?.data?.error || 'Failed to fetch GitHub repositories')
    } finally {
      setLoadingRepos(false)
    }
  }

  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      await fetchContainers()
      setLoading(false)
    }
    loadData()
  }, [fetchContainers])

  // Poll for container status updates
  useEffect(() => {
    const initializingContainers = containers.filter(
      c => c.init_status === 'pending' || c.init_status === 'cloning' || c.init_status === 'initializing'
    )
    
    if (initializingContainers.length === 0) return

    const interval = setInterval(() => {
      fetchContainers()
    }, 3000)

    return () => clearInterval(interval)
  }, [containers, fetchContainers])

  const handleOpenModal = () => {
    setModalVisible(true)
    fetchRemoteRepos()
  }

  const handleCreate = async (values: { 
    name: string
    repo_source: 'select' | 'url'
    selected_repo?: string
    git_repo_url?: string
  }) => {
    setCreating(true)
    try {
      let gitRepoUrl = ''
      let gitRepoName = ''

      if (values.repo_source === 'select' && values.selected_repo) {
        const selectedRepo = remoteRepos.find(r => r.clone_url === values.selected_repo)
        if (selectedRepo) {
          gitRepoUrl = selectedRepo.clone_url
          gitRepoName = selectedRepo.name
        }
      } else if (values.repo_source === 'url' && values.git_repo_url) {
        gitRepoUrl = values.git_repo_url
      }

      if (!gitRepoUrl) {
        message.error('Please select a repository or enter a URL')
        setCreating(false)
        return
      }

      await containerApi.create(values.name, gitRepoUrl, gitRepoName)
      message.success('Container created! Initialization starting...')
      setModalVisible(false)
      form.resetFields()
      fetchContainers()
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } }
      message.error(err.response?.data?.error || 'Failed to create container')
    } finally {
      setCreating(false)
    }
  }

  const handleStart = async (id: number) => {
    try {
      await containerApi.start(id)
      message.success('Container started')
      fetchContainers()
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } }
      message.error(err.response?.data?.error || 'Failed to start container')
    }
  }

  const handleStop = async (id: number) => {
    try {
      await containerApi.stop(id)
      message.success('Container stopped')
      fetchContainers()
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } }
      message.error(err.response?.data?.error || 'Failed to stop container')
    }
  }

  const handleDelete = async (id: number) => {
    try {
      await containerApi.delete(id)
      message.success('Container deleted')
      fetchContainers()
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } }
      message.error(err.response?.data?.error || 'Failed to delete container')
    }
  }

  const getStatusTag = (status: string) => {
    const colors: Record<string, string> = {
      running: 'green',
      stopped: 'red',
      created: 'blue',
    }
    return <Tag color={colors[status] || 'default'}>{status}</Tag>
  }

  const getInitStatusDisplay = (container: Container) => {
    const { init_status, init_message } = container

    switch (init_status) {
      case 'pending':
        return (
          <div>
            <Tag icon={<LoadingOutlined spin />} color="processing">Starting</Tag>
            <Text type="secondary" style={{ fontSize: 12 }}>Preparing container...</Text>
          </div>
        )
      case 'cloning':
        return (
          <div>
            <Tag icon={<LoadingOutlined spin />} color="processing">Cloning</Tag>
            <Progress percent={30} size="small" status="active" />
            <Text type="secondary" style={{ fontSize: 12 }}>{init_message}</Text>
          </div>
        )
      case 'initializing':
        return (
          <div>
            <Tag icon={<LoadingOutlined spin />} color="processing">Initializing</Tag>
            <Progress percent={70} size="small" status="active" />
            <Text type="secondary" style={{ fontSize: 12 }}>{init_message}</Text>
          </div>
        )
      case 'ready':
        return (
          <div>
            <Tag icon={<CheckCircleOutlined />} color="success">Ready</Tag>
          </div>
        )
      case 'failed':
        return (
          <div>
            <Tag icon={<CloseCircleOutlined />} color="error">Failed</Tag>
            <Text type="danger" style={{ fontSize: 12, display: 'block' }}>{init_message}</Text>
          </div>
        )
      default:
        return null
    }
  }

  const canAccessTerminal = (container: Container) => {
    return container.status === 'running' && container.init_status === 'ready'
  }

  const canStartContainer = (container: Container) => {
    return container.status === 'stopped' && container.init_status === 'ready'
  }

  const canStopContainer = (container: Container) => {
    return container.status === 'running'
  }

  const handleViewLogs = async (containerId: number) => {
    setSelectedContainerId(containerId)
    setLogModalVisible(true)
    setLoadingLogs(true)
    try {
      const response = await containerApi.getLogs(containerId, 50)
      setLogs(response.data || [])
    } catch (error) {
      message.error('Failed to fetch logs')
    } finally {
      setLoadingLogs(false)
    }
  }

  const getLogIcon = (level: string) => {
    switch (level) {
      case 'error':
        return <CloseCircleFilled style={{ color: '#ff4d4f' }} />
      case 'warn':
        return <WarningOutlined style={{ color: '#faad14' }} />
      default:
        return <InfoCircleOutlined style={{ color: '#1890ff' }} />
    }
  }

  const getLogColor = (level: string) => {
    switch (level) {
      case 'error':
        return 'red'
      case 'warn':
        return 'orange'
      default:
        return 'blue'
    }
  }

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 50 }}>
        <Spin size="large" />
      </div>
    )
  }

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <h2>Containers</h2>
        <Space>
          <Button icon={<SyncOutlined />} onClick={fetchContainers}>
            Refresh
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleOpenModal}
          >
            Create Container
          </Button>
        </Space>
      </div>

      {containers.length === 0 ? (
        <Empty description="No containers yet. Create one to get started!" />
      ) : (
        <Row gutter={[16, 16]}>
          {containers.map((container) => (
            <Col xs={24} sm={12} lg={8} key={container.id}>
              <Card
                title={container.name}
                extra={getStatusTag(container.status)}
                actions={[
                  canStopContainer(container) ? (
                    <Button
                      type="text"
                      icon={<PauseCircleOutlined />}
                      onClick={() => handleStop(container.id)}
                    >
                      Stop
                    </Button>
                  ) : canStartContainer(container) ? (
                    <Button
                      type="text"
                      icon={<PlayCircleOutlined />}
                      onClick={() => handleStart(container.id)}
                    >
                      Start
                    </Button>
                  ) : (
                    <Button type="text" disabled icon={<ReloadOutlined spin />}>
                      Initializing
                    </Button>
                  ),
                  <Button
                    type="text"
                    icon={<FileTextOutlined />}
                    onClick={() => handleViewLogs(container.id)}
                  >
                    Logs
                  </Button>,
                  <Button
                    type="text"
                    icon={<CodeOutlined />}
                    onClick={() => navigate(`/terminal/${container.id}`)}
                    disabled={!canAccessTerminal(container)}
                  >
                    Terminal
                  </Button>,
                  <Popconfirm
                    title="Delete this container?"
                    onConfirm={() => handleDelete(container.id)}
                    okText="Yes"
                    cancelText="No"
                  >
                    <Button type="text" danger icon={<DeleteOutlined />}>
                      Delete
                    </Button>
                  </Popconfirm>,
                ]}
              >
                <p><strong>Repository:</strong> {container.git_repo_name || 'N/A'}</p>
                <p><strong>Created:</strong> {new Date(container.created_at).toLocaleString()}</p>
                <div style={{ marginTop: 8 }}>
                  <strong>Status:</strong>
                  {getInitStatusDisplay(container)}
                </div>
              </Card>
            </Col>
          ))}
        </Row>
      )}

      <Modal
        title="Create Container"
        open={modalVisible}
        onCancel={() => {
          setModalVisible(false)
          form.resetFields()
          setRepoSource('select')
        }}
        footer={null}
        width={600}
      >
        <Form 
          form={form} 
          onFinish={handleCreate} 
          layout="vertical"
          initialValues={{ repo_source: 'select' }}
        >
          <Form.Item
            name="name"
            label="Container Name"
            rules={[{ required: true, message: 'Please enter a name' }]}
          >
            <Input placeholder="my-project-container" />
          </Form.Item>

          <Form.Item
            name="repo_source"
            label="Repository Source"
          >
            <Select onChange={(value) => setRepoSource(value)}>
              <Select.Option value="select">Select from GitHub</Select.Option>
              <Select.Option value="url">Enter URL manually</Select.Option>
            </Select>
          </Form.Item>

          {repoSource === 'select' ? (
            <Form.Item
              name="selected_repo"
              label="GitHub Repository"
              rules={[{ required: repoSource === 'select', message: 'Please select a repository' }]}
            >
              <Select
                placeholder="Select a repository"
                loading={loadingRepos}
                showSearch
                optionFilterProp="children"
                notFoundContent={loadingRepos ? <Spin size="small" /> : 'No repositories found'}
              >
                {remoteRepos.map((repo) => (
                  <Select.Option key={repo.id} value={repo.clone_url}>
                    {repo.full_name} {repo.private && <Tag color="orange" style={{ marginLeft: 8 }}>Private</Tag>}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
          ) : (
            <Form.Item
              name="git_repo_url"
              label="GitHub Repository URL"
              rules={[
                { required: repoSource === 'url', message: 'Please enter a repository URL' },
                { pattern: /^https:\/\/github\.com\//, message: 'Please enter a valid GitHub URL' }
              ]}
            >
              <Input placeholder="https://github.com/username/repository" />
            </Form.Item>
          )}

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" loading={creating}>
                Create Container
              </Button>
              <Button onClick={() => {
                setModalVisible(false)
                form.resetFields()
              }}>
                Cancel
              </Button>
            </Space>
          </Form.Item>
        </Form>

        <div style={{ marginTop: 16, padding: 12, background: '#f5f5f5', borderRadius: 4 }}>
          <Text type="secondary">
            <strong>What happens:</strong>
            <ol style={{ marginTop: 8, paddingLeft: 20, marginBottom: 0 }}>
              <li>Container will be created and started automatically</li>
              <li>Repository will be cloned inside the container</li>
              <li>Claude Code will set up the development environment</li>
              <li>Once ready, you can access the terminal</li>
            </ol>
          </Text>
        </div>
      </Modal>

      <Modal
        title="Container Logs"
        open={logModalVisible}
        onCancel={() => {
          setLogModalVisible(false)
          setLogs([])
          setSelectedContainerId(null)
        }}
        footer={[
          <Button key="refresh" icon={<SyncOutlined />} onClick={() => selectedContainerId && handleViewLogs(selectedContainerId)}>
            Refresh
          </Button>,
          <Button key="close" onClick={() => setLogModalVisible(false)}>
            Close
          </Button>,
        ]}
        width={700}
      >
        {loadingLogs ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Spin size="large" />
          </div>
        ) : logs.length === 0 ? (
          <Empty description="No logs yet" />
        ) : (
          <div style={{ maxHeight: 400, overflow: 'auto' }}>
            <Timeline
              items={logs.slice().reverse().map((log) => ({
                dot: getLogIcon(log.level),
                color: getLogColor(log.level),
                children: (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Tag color={getLogColor(log.level)}>{log.stage}</Tag>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {new Date(log.CreatedAt).toLocaleString()}
                      </Text>
                    </div>
                    <div style={{ marginTop: 4 }}>{log.message}</div>
                  </div>
                ),
              }))}
            />
          </div>
        )}
      </Modal>
    </div>
  )
}
