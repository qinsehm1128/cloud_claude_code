import { useState, useEffect, useRef } from 'react'
import {
  Folder,
  File,
  Download,
  Trash2,
  FolderPlus,
  Upload,
  Home,
  ChevronRight,
  Loader2,
  GripVertical,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { fileApi } from '@/services/api'

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
  onFileDrag?: (path: string) => void
}

export default function FileBrowser({ containerId }: FileBrowserProps) {
  const [files, setFiles] = useState<FileInfo[]>([])
  const [currentPath, setCurrentPath] = useState('/')
  const [loading, setLoading] = useState(false)
  const [mkdirVisible, setMkdirVisible] = useState(false)
  const [newDirName, setNewDirName] = useState('')
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const fetchFiles = async (path: string) => {
    setLoading(true)
    try {
      const response = await fileApi.listDirectory(containerId, path)
      setFiles(response.data || [])
      setCurrentPath(path)
    } catch {
      console.error('Failed to list directory')
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
    } catch {
      console.error('Failed to download file')
    }
  }

  const handleDelete = async (file: FileInfo) => {
    setDeleting(file.path)
    try {
      await fileApi.delete(containerId, file.path)
      fetchFiles(currentPath)
    } catch {
      console.error('Failed to delete')
    } finally {
      setDeleting(null)
    }
  }

  const handleCreateDir = async () => {
    if (!newDirName.trim()) return
    setCreating(true)
    try {
      const path = currentPath === '/' ? `/${newDirName}` : `${currentPath}/${newDirName}`
      await fileApi.createDirectory(containerId, path)
      setMkdirVisible(false)
      setNewDirName('')
      fetchFiles(currentPath)
    } catch {
      console.error('Failed to create directory')
    } finally {
      setCreating(false)
    }
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      await fileApi.upload(containerId, currentPath, file)
      fetchFiles(currentPath)
    } catch {
      console.error('Failed to upload file')
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '-'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const getBreadcrumbParts = () => {
    const parts = currentPath.split('/').filter(Boolean)
    const items: { name: string; path: string }[] = [{ name: 'workspace', path: '/' }]
    
    let path = ''
    parts.forEach((part) => {
      path += '/' + part
      items.push({ name: part, path })
    })
    
    return items
  }

  return (
    <div className="space-y-4">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1 text-sm flex-wrap">
        {getBreadcrumbParts().map((item, index, arr) => (
          <div key={item.path} className="flex items-center gap-1">
            {index === 0 ? (
              <button
                onClick={() => handleNavigate(item.path)}
                className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
              >
                <Home className="h-4 w-4" />
                {item.name}
              </button>
            ) : (
              <>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                <button
                  onClick={() => handleNavigate(item.path)}
                  className={`hover:text-foreground ${
                    index === arr.length - 1 ? 'text-foreground font-medium' : 'text-muted-foreground'
                  }`}
                >
                  {item.name}
                </button>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleUpload}
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="h-4 w-4 mr-2" />
          Upload
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setMkdirVisible(true)}
        >
          <FolderPlus className="h-4 w-4 mr-2" />
          New Folder
        </Button>
      </div>

      {/* Drag hint */}
      <p className="text-xs text-muted-foreground">
        💡 Drag files to terminal to insert path
      </p>

      {/* File List */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : files.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          Empty directory
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="w-[80px]">Size</TableHead>
              <TableHead className="w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {files.map((file) => (
              <TableRow 
                key={file.path}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/plain', file.path)
                  e.dataTransfer.effectAllowed = 'copy'
                }}
                className="cursor-grab active:cursor-grabbing"
              >
                <TableCell>
                  <div className="flex items-center gap-2">
                    <GripVertical className="h-3 w-3 text-muted-foreground/50 flex-shrink-0" />
                    {file.is_directory ? (
                      <Folder className="h-4 w-4 text-blue-400 flex-shrink-0" />
                    ) : (
                      <File className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    )}
                    {file.is_directory ? (
                      <button
                        onClick={() => handleNavigate(file.path)}
                        className="hover:text-blue-400 hover:underline truncate"
                      >
                        {file.name}
                      </button>
                    ) : (
                      <span className="truncate">{file.name}</span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground text-xs">
                  {file.is_directory ? '-' : formatSize(file.size)}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    {!file.is_directory && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => handleDownload(file)}
                      >
                        <Download className="h-3 w-3" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                      onClick={() => handleDelete(file)}
                      disabled={deleting === file.path}
                    >
                      {deleting === file.path ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Trash2 className="h-3 w-3" />
                      )}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Create Directory Dialog */}
      <Dialog open={mkdirVisible} onOpenChange={setMkdirVisible}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Create New Directory</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input
              placeholder="Directory name"
              value={newDirName}
              onChange={(e) => setNewDirName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateDir()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMkdirVisible(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateDir} disabled={creating || !newDirName.trim()}>
              {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
