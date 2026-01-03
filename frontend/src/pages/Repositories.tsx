import { useState, useEffect } from 'react'
import {
  Table,
  Button,
  Modal,
  message,
  Space,
  Popconfirm,
  Tag,
  Empty,
  Spin,
} from 'antd'
import { PlusOutlined, DeleteOutlined, SyncOutlined } from '@ant-design/icons'
import { repoApi } from '../services/api'

interface LocalRepository {
  ID: number
  name: string
  url: string
  local_path: string
  size: number
  cloned_at: string
}

interface RemoteRepository {
  id: number
  name: string
  full_name: string
  description: string
  clone_url: string
  html_url: string
  private: boolean
  size: number
}

export default function Repositories() {
  const [localRepos, setLocalRepos] = useState<LocalRepository[]>([])
  const [remoteRepos, setRemoteRepos] = useState<RemoteRepository[]>([])
  const [loading, setLoading] = useState(true)
  const [modalVisible, setModalVisible] = useState(false)
  const [loadingRemote, setLoadingRemote] = useState(false)
  const [cloning, setCloning] = useState<number | null>(null)

  const fetchLocalRepos = async () => {
    try {
      const response = await repoApi.listLocal()
      setLocalRepos(response.data || [])
    } catch (error) {
      message.error('Failed to fetch local repositories')
    }
  }

  const fetchRemoteRepos = async () => {
    setLoadingRemote(true)
    try {
      const response = await repoApi.listRemote()
      setRemoteRepos(response.data || [])
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } }
      message.error(err.response?.data?.error || 'Failed to fetch remote repositories')
    } finally {
      setLoadingRemote(false)
    }
  }

  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      await fetchLocalRepos()
      setLoading(false)
    }
    loadData()
  }, [])

  const handleOpenModal = () => {
    setModalVisible(true)
    fetchRemoteRepos()
  }

  const handleClone = async (repo: RemoteRepository) => {
    setCloning(repo.id)
    try {
      await repoApi.clone(repo.clone_url, repo.name)
      message.success(`Repository ${repo.name} cloned successfully`)
      fetchLocalRepos()
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } }
      message.error(err.response?.data?.error || 'Failed to clone repository')
    } finally {
      setCloning(null)
    }
  }

  const handleDelete = async (id: number) => {
    try {
      await repoApi.delete(id)
      message.success('Repository deleted successfully')
      fetchLocalRepos()
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } }
      message.error(err.response?.data?.error || 'Failed to delete repository')
    }
  }

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const localColumns = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: 'URL',
      dataIndex: 'url',
      key: 'url',
      render: (url: string) => (
        <a href={url} target="_blank" rel="noopener noreferrer">
          {url}
        </a>
      ),
    },
    {
      title: 'Size',
      dataIndex: 'size',
      key: 'size',
      render: (size: number) => formatSize(size),
    },
    {
      title: 'Cloned At',
      dataIndex: 'cloned_at',
      key: 'cloned_at',
      render: (date: string) => new Date(date).toLocaleString(),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: unknown, record: LocalRepository) => (
        <Popconfirm
          title="Delete this repository?"
          description="This will remove the local copy of the repository."
          onConfirm={() => handleDelete(record.ID)}
          okText="Yes"
          cancelText="No"
        >
          <Button type="text" danger icon={<DeleteOutlined />}>
            Delete
          </Button>
        </Popconfirm>
      ),
    },
  ]

  const remoteColumns = [
    {
      title: 'Name',
      dataIndex: 'full_name',
      key: 'full_name',
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
    },
    {
      title: 'Visibility',
      dataIndex: 'private',
      key: 'private',
      render: (isPrivate: boolean) => (
        <Tag color={isPrivate ? 'orange' : 'green'}>
          {isPrivate ? 'Private' : 'Public'}
        </Tag>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: unknown, record: RemoteRepository) => {
        const isCloned = localRepos.some((r) => r.url === record.clone_url)
        return isCloned ? (
          <Tag color="blue">Cloned</Tag>
        ) : (
          <Button
            type="primary"
            size="small"
            loading={cloning === record.id}
            onClick={() => handleClone(record)}
          >
            Clone
          </Button>
        )
      },
    },
  ]

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
        <h2>Repositories</h2>
        <Space>
          <Button icon={<SyncOutlined />} onClick={fetchLocalRepos}>
            Refresh
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleOpenModal}>
            Clone Repository
          </Button>
        </Space>
      </div>

      {localRepos.length === 0 ? (
        <Empty description="No repositories cloned yet. Clone one from GitHub!" />
      ) : (
        <Table
          columns={localColumns}
          dataSource={localRepos}
          rowKey="ID"
          pagination={false}
        />
      )}

      <Modal
        title="Clone Repository from GitHub"
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={null}
        width={800}
      >
        {loadingRemote ? (
          <div style={{ textAlign: 'center', padding: 50 }}>
            <Spin size="large" />
          </div>
        ) : remoteRepos.length === 0 ? (
          <Empty description="No repositories found. Make sure your GitHub token is configured." />
        ) : (
          <Table
            columns={remoteColumns}
            dataSource={remoteRepos}
            rowKey="id"
            pagination={{ pageSize: 10 }}
            size="small"
          />
        )}
      </Modal>
    </div>
  )
}
