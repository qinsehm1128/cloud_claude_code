import { useState, useEffect } from 'react'
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
} from 'antd'
import {
  PlayCircleOutlined,
  PauseCircleOutlined,
  DeleteOutlined,
  PlusOutlined,
  CodeOutlined,
} from '@ant-design/icons'
import { containerApi, repoApi } from '../services/api'

interface Container {
  id: number
  docker_id: string
  name: string
  status: string
  repository: string
  repository_id: number
  created_at: string
  started_at?: string
  stopped_at?: string
}

interface Repository {
  ID: number
  name: string
  url: string
  local_path: string
}

export default function Dashboard() {
  const [containers, setContainers] = useState<Container[]>([])
  const [repositories, setRepositories] = useState<Repository[]>([])
  const [loading, setLoading] = useState(true)
  const [modalVisible, setModalVisible] = useState(false)
  const [creating, setCreating] = useState(false)
  const [form] = Form.useForm()
  const navigate = useNavigate()

  const fetchContainers = async () => {
    try {
      const response = await containerApi.list()
      setContainers(response.data)
    } catch (error) {
      message.error('Failed to fetch containers')
    }
  }

  const fetchRepositories = async () => {
    try {
      const response = await repoApi.listLocal()
      setRepositories(response.data)
    } catch (error) {
      message.error('Failed to fetch repositories')
    }
  }

  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      await Promise.all([fetchContainers(), fetchRepositories()])
      setLoading(false)
    }
    loadData()
  }, [])

  const handleCreate = async (values: { name: string; repository_id: number }) => {
    setCreating(true)
    try {
      await containerApi.create(values.name, values.repository_id)
      message.success('Container created successfully')
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
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => setModalVisible(true)}
          disabled={repositories.length === 0}
        >
          Create Container
        </Button>
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
                  container.status === 'running' ? (
                    <Button
                      type="text"
                      icon={<PauseCircleOutlined />}
                      onClick={() => handleStop(container.id)}
                    >
                      Stop
                    </Button>
                  ) : (
                    <Button
                      type="text"
                      icon={<PlayCircleOutlined />}
                      onClick={() => handleStart(container.id)}
                    >
                      Start
                    </Button>
                  ),
                  <Button
                    type="text"
                    icon={<CodeOutlined />}
                    onClick={() => navigate(`/terminal/${container.id}`)}
                    disabled={container.status !== 'running'}
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
                <p><strong>Repository:</strong> {container.repository}</p>
                <p><strong>Created:</strong> {new Date(container.created_at).toLocaleString()}</p>
              </Card>
            </Col>
          ))}
        </Row>
      )}

      <Modal
        title="Create Container"
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={null}
      >
        <Form form={form} onFinish={handleCreate} layout="vertical">
          <Form.Item
            name="name"
            label="Container Name"
            rules={[{ required: true, message: 'Please enter a name' }]}
          >
            <Input placeholder="my-container" />
          </Form.Item>
          <Form.Item
            name="repository_id"
            label="Repository"
            rules={[{ required: true, message: 'Please select a repository' }]}
          >
            <Select placeholder="Select a repository">
              {repositories.map((repo) => (
                <Select.Option key={repo.ID} value={repo.ID}>
                  {repo.name}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" loading={creating}>
                Create
              </Button>
              <Button onClick={() => setModalVisible(false)}>Cancel</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
