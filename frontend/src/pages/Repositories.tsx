import { useState, useEffect } from 'react'
import {
  Plus,
  Trash2,
  RefreshCw,
  Loader2,
  ExternalLink,
  FolderGit2,
  Lock,
  Globe,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ScrollArea } from '@/components/ui/scroll-area'
import { repoApi } from '@/services/api'

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
  const [deleting, setDeleting] = useState<number | null>(null)

  const fetchLocalRepos = async () => {
    try {
      const response = await repoApi.listLocal()
      setLocalRepos(response.data || [])
    } catch {
      console.error('Failed to fetch local repositories')
    }
  }

  const fetchRemoteRepos = async () => {
    setLoadingRemote(true)
    try {
      const response = await repoApi.listRemote()
      setRemoteRepos(response.data || [])
    } catch {
      console.error('Failed to fetch remote repositories')
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
      fetchLocalRepos()
    } catch {
      console.error('Failed to clone repository')
    } finally {
      setCloning(null)
    }
  }

  const handleDelete = async (id: number) => {
    setDeleting(id)
    try {
      await repoApi.delete(id)
      fetchLocalRepos()
    } catch {
      console.error('Failed to delete repository')
    } finally {
      setDeleting(null)
    }
  }

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Repositories</h1>
          <p className="text-muted-foreground">Manage your cloned repositories</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchLocalRepos}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button size="sm" onClick={handleOpenModal}>
            <Plus className="h-4 w-4 mr-2" />
            Clone Repository
          </Button>
        </div>
      </div>

      {/* Repository List */}
      {localRepos.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FolderGit2 className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No repositories yet</h3>
            <p className="text-muted-foreground text-sm mb-4">
              Clone a repository from GitHub to get started
            </p>
            <Button onClick={handleOpenModal}>
              <Plus className="h-4 w-4 mr-2" />
              Clone Repository
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>URL</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Cloned At</TableHead>
                <TableHead className="w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {localRepos.map((repo) => (
                <TableRow key={repo.ID}>
                  <TableCell className="font-medium">{repo.name}</TableCell>
                  <TableCell>
                    <a
                      href={repo.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                    >
                      {repo.url}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </TableCell>
                  <TableCell>{formatSize(repo.size)}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(repo.cloned_at).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleDelete(repo.ID)}
                      disabled={deleting === repo.ID}
                    >
                      {deleting === repo.ID ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Clone Dialog */}
      <Dialog open={modalVisible} onOpenChange={setModalVisible}>
        <DialogContent className="sm:max-w-[700px]">
          <DialogHeader>
            <DialogTitle>Clone Repository from GitHub</DialogTitle>
            <DialogDescription>
              Select a repository from your GitHub account to clone
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="h-[400px] rounded-md border">
            {loadingRemote ? (
              <div className="flex items-center justify-center h-full py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : remoteRepos.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-12">
                <FolderGit2 className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-muted-foreground text-sm">
                  No repositories found. Make sure your GitHub token is configured.
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Repository</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Visibility</TableHead>
                    <TableHead className="w-[100px]">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {remoteRepos.map((repo) => {
                    const isCloned = localRepos.some((r) => r.url === repo.clone_url)
                    return (
                      <TableRow key={repo.id}>
                        <TableCell className="font-medium">{repo.full_name}</TableCell>
                        <TableCell className="text-muted-foreground text-sm max-w-[200px] truncate">
                          {repo.description || '-'}
                        </TableCell>
                        <TableCell>
                          {repo.private ? (
                            <Badge variant="warning" className="gap-1">
                              <Lock className="h-3 w-3" />
                              Private
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="gap-1">
                              <Globe className="h-3 w-3" />
                              Public
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {isCloned ? (
                            <Badge variant="success">Cloned</Badge>
                          ) : (
                            <Button
                              size="sm"
                              onClick={() => handleClone(repo)}
                              disabled={cloning === repo.id}
                            >
                              {cloning === repo.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                'Clone'
                              )}
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  )
}
