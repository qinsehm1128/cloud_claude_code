import { useState, useEffect } from 'react'
import {
  Table,
  Button,
  Breadcrumb,
  Space,
  message,
  Popconfirm,
  Modal,
  Input,
  Upload,
} from 'antd'
import {
  FolderOutlined,
  FileOutlined,
  DownloadOutlined,
  DeleteOutlined,
  FolderAddOutlined,
  UploadOutlined,
  HomeOutlined,
} from '@ant-design/icons'
import type { UploadProps } from 'antd'
import { fileApi } from '../../services/api'

interface FileInfo {
  name: string
  path: string
  size: number
  is_directory: boolean
  modified_time: string
  permissions: string
}

interface FileBrowserProps {
  containerId: number
}

export default function FileBrowser({ containerId }: FileBrowserProps) {
  const [files, setFiles] = useState<FileInfo[]>([])
  const [currentPath, setCurrentPath] = useState('/')
  const [loading, setLoading] = useState(false)
  const [mkdirVisible, setMkdirVisible] = useState(false)
  const [newDirName, setNewDirName] = useState('')

  const fetchFiles = async (path: string) => {
    setLoading(true)
    try {
      const response = await fileApi.listDirectory(containerId, path)
      setFiles(response.data || [])
      setCurrentPath(path)
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } }
      message.error(err.response?.data?.error || 'Failed to list directory')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchFiles('/')
  }, [containerId])

  const handleNavigate = (path: string) => {
    fetchFiles(path)
  }

  const handleDownload = async (file: FileInfo) => {
    try {
      const response = await fileApi.download(containerId, file.path)
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', file.name)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } }
      message.error(err.response?.data?.error || 'Failed to download file')
    }
  }

  const handleDelete = async (file: FileInfo) => {
    try {
      await fileApi.delete(containerId, file.path)
      message.success('Deleted successfully')
      fetchFiles(currentPath)
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } }
      message.error(err.response?.data?.error || 'Failed to delete')
    }
  }

  const handleCreateDir = async () => {
    if (!newDirName.trim()) {
      message.error('Please enter a directory name')
      return
    }
    try {
      const path = currentPath === '/' ? `/${newDirName}` : `${currentPath}/${newDirName}`
      await fileApi.createDirectory(containerId, path)
      message.success('Directory created')
      setMkdirVisible(false)
      setNewDirName('')
      fetchFiles(currentPath)
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } }
      message.error(err.response?.data?.error || 'Failed to create directory')
    }
  }

  const uploadProps: UploadProps = {
    name: 'file',
    multiple: false,
    showUploadList: false,
    customRequest: async ({ file, onSuccess, onError }) => {
      try {
        await fileApi.upload(containerId, currentPath, file as File)
        message.success('File uploaded successfully')
        fetchFiles(currentPath)
        onSuccess?.({})
      } catch (error: unknown) {
        const err = error as { response?: { data?: { error?: string } } }
        message.error(err.response?.data?.error || 'Failed to upload file')
        onError?.(new Error('Upload failed'))
      }
    },
  }

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '-'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const getBreadcrumbItems = () => {
    const parts = currentPath.split('/').filter(Boolean)
    const items = [
      {
        title: (
          <a onClick={() => handleNavigate('/')}>
            <HomeOutlined /> workspace
          </a>
        ),
      },
    ]

    let path = ''
    parts.forEach((part) => {
      path += '/' + part
      const currentPathCopy = path
      items.push({
        title: <a onClick={() => handleNavigate(currentPathCopy)}>{part}</a>,
      })
    })

    return items
  }

  const columns = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record: FileInfo) => (
        <Space>
          {record.is_directory ? (
            <FolderOutlined style={{ color: '#1890ff' }} />
          ) : (
            <FileOutlined />
          )}
          {record.is_directory ? (
            <a onClick={() => handleNavigate(record.path)}>{name}</a>
          ) : (
            name
          )}
        </Space>
      ),
    },
    {
      title: 'Size',
      dataIndex: 'size',
      key: 'size',
      width: 100,
      render: (size: number, record: FileInfo) =>
        record.is_directory ? '-' : formatSize(size),
    },
    {
      title: 'Modified',
      dataIndex: 'modified_time',
      key: 'modified_time',
      width: 180,
      render: (time: string) =>
        time ? new Date(time).toLocaleString() : '-',
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 150,
      render: (_: unknown, record: FileInfo) => (
        <Space>
          {!record.is_directory && (
            <Button
              type="text"
              size="small"
              icon={<DownloadOutlined />}
              onClick={() => handleDownload(record)}
            />
          )}
          <Popconfirm
            title={`Delete ${record.is_directory ? 'directory' : 'file'}?`}
            onConfirm={() => handleDelete(record)}
            okText="Yes"
            cancelText="No"
          >
            <Button type="text" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Breadcrumb items={getBreadcrumbItems()} />
      </div>
      <div style={{ marginBottom: 16 }}>
        <Space>
          <Upload {...uploadProps}>
            <Button icon={<UploadOutlined />}>Upload File</Button>
          </Upload>
          <Button
            icon={<FolderAddOutlined />}
            onClick={() => setMkdirVisible(true)}
          >
            New Folder
          </Button>
        </Space>
      </div>
      <Table
        columns={columns}
        dataSource={files}
        rowKey="path"
        loading={loading}
        pagination={false}
        size="small"
      />

      <Modal
        title="Create New Directory"
        open={mkdirVisible}
        onOk={handleCreateDir}
        onCancel={() => {
          setMkdirVisible(false)
          setNewDirName('')
        }}
      >
        <Input
          placeholder="Directory name"
          value={newDirName}
          onChange={(e) => setNewDirName(e.target.value)}
          onPressEnter={handleCreateDir}
        />
      </Modal>
    </div>
  )
}
