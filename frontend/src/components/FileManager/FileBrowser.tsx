import { useEffect, useRef, useState } from 'react'
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
  FolderUp,
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
  rootPath?: string
  onFileDrag?: (path: string) => void
}

const DEFAULT_ROOT_PATH = '/app'

function normalizePath(value?: string): string {
  const normalized = (value || DEFAULT_ROOT_PATH).replace(/\\/g, '/').trim()
  if (!normalized) {
    return DEFAULT_ROOT_PATH
  }

  const segments = normalized.split('/').filter(Boolean)
  return '/' + segments.join('/')
}

function joinPath(basePath: string, childPath: string): string {
  return normalizePath(`${basePath}/${childPath}`)
}

function extractFilename(contentDisposition?: string, fallback?: string): string {
  if (!contentDisposition) {
    return fallback || 'download'
  }

  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i)
  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1])
  }

  const basicMatch = contentDisposition.match(/filename="?([^"]+)"?/i)
  if (basicMatch?.[1]) {
    return basicMatch[1]
  }

  return fallback || 'download'
}

export default function FileBrowser({ containerId, rootPath, onFileDrag }: FileBrowserProps) {
  const normalizedRootPath = normalizePath(rootPath)
  const [files, setFiles] = useState<FileInfo[]>([])
  const [currentPath, setCurrentPath] = useState(normalizedRootPath)
  const [loading, setLoading] = useState(false)
  const [mkdirVisible, setMkdirVisible] = useState(false)
  const [newDirName, setNewDirName] = useState('')
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [uploadingMode, setUploadingMode] = useState<'files' | 'folder' | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (folderInputRef.current) {
      folderInputRef.current.setAttribute('webkitdirectory', '')
      folderInputRef.current.setAttribute('directory', '')
    }
  }, [])

  const fetchFiles = async (path: string) => {
    setLoading(true)
    try {
      const normalizedPath = normalizePath(path)
      const response = await fileApi.listDirectory(containerId, normalizedPath)
      setFiles(response.data || [])
      setCurrentPath(normalizedPath)
    } catch {
      console.error('Failed to list directory')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchFiles(normalizedRootPath)
  }, [containerId, normalizedRootPath])

  const handleNavigate = (path: string) => {
    fetchFiles(path)
  }

  const handleDownload = async (file: FileInfo) => {
    try {
      const response = await fileApi.download(containerId, file.path)
      const fallbackName = file.is_directory ? `${file.name}.zip` : file.name
      const filename = extractFilename(response.headers['content-disposition'], fallbackName)
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', filename)
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
      const path = joinPath(currentPath, newDirName)
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

  const handleUploadSelection = async (
    fileList: FileList | null,
    mode: 'files' | 'folder',
    inputRef: React.RefObject<HTMLInputElement | null>
  ) => {
    const selectedFiles = Array.from(fileList || [])
    if (selectedFiles.length === 0) return

    setUploadingMode(mode)
    try {
      await fileApi.upload(containerId, currentPath, selectedFiles)
      fetchFiles(currentPath)
    } catch {
      console.error('Failed to upload files')
    } finally {
      setUploadingMode(null)
      if (inputRef.current) {
        inputRef.current.value = ''
      }
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
    const items: { name: string; path: string }[] = [
      { name: normalizedRootPath, path: normalizedRootPath },
    ]

    if (currentPath === normalizedRootPath) {
      return items
    }

    const relativePath = currentPath.startsWith(`${normalizedRootPath}/`)
      ? currentPath.slice(normalizedRootPath.length + 1)
      : currentPath.replace(/^\//, '')

    const parts = relativePath.split('/').filter(Boolean)
    let nextPath = normalizedRootPath

    parts.forEach((part) => {
      nextPath = joinPath(nextPath, part)
      items.push({ name: part, path: nextPath })
    })

    return items
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 text-sm flex-wrap">
        {getBreadcrumbParts().map((item, index, arr) => (
          <div key={item.path} className="flex items-center gap-1">
            {index === 0 ? (
              <button
                onClick={() => handleNavigate(item.path)}
                className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
              >
                <Home className="h-4 w-4" />
                <span className="font-mono text-xs sm:text-sm">{item.name}</span>
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

      <div className="flex items-center gap-2 flex-wrap">
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          multiple
          onChange={(event) => handleUploadSelection(event.target.files, 'files', fileInputRef)}
        />
        <input
          ref={folderInputRef}
          type="file"
          className="hidden"
          multiple
          onChange={(event) => handleUploadSelection(event.target.files, 'folder', folderInputRef)}
        />

        <Button
          variant="outline"
          size="sm"
          disabled={uploadingMode !== null}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploadingMode === 'files' ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Upload className="h-4 w-4 mr-2" />
          )}
          Upload Files
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={uploadingMode !== null}
          onClick={() => folderInputRef.current?.click()}
        >
          {uploadingMode === 'folder' ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <FolderUp className="h-4 w-4 mr-2" />
          )}
          Upload Folder
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

      <p className="text-xs text-muted-foreground">
        Drag files or folders into the terminal to insert their current container path.
      </p>

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
              <TableHead className="w-[120px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {files.map((file) => (
              <TableRow
                key={file.path}
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.setData('text/plain', file.path)
                  event.dataTransfer.effectAllowed = 'copy'
                  onFileDrag?.(file.path)
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
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => handleDownload(file)}
                      title={file.is_directory ? 'Download folder as zip' : 'Download file'}
                    >
                      <Download className="h-3 w-3" />
                    </Button>
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

      <Dialog open={mkdirVisible} onOpenChange={setMkdirVisible}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Create New Directory</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input
              placeholder="Directory name"
              value={newDirName}
              onChange={(event) => setNewDirName(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && handleCreateDir()}
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
