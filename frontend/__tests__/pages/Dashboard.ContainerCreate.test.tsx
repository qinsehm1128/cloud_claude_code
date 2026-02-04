import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import Dashboard from '@/pages/Dashboard'
import type { ClaudeConfigTemplate } from '@/types/claudeConfig'

// Mock the API modules
vi.mock('@/services/api', () => ({
  containerApi: {
    list: vi.fn(),
    create: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    delete: vi.fn(),
    getLogs: vi.fn(),
  },
  repoApi: {
    listRemote: vi.fn(),
  },
  configProfileApi: {
    listGitHubTokens: vi.fn(),
    listEnvProfiles: vi.fn(),
    listCommandProfiles: vi.fn(),
  },
}))

vi.mock('@/services/claudeConfigApi', () => ({
  claudeConfigApi: {
    list: vi.fn(),
  },
}))

// Mock the toast module
vi.mock('@/components/ui/toast', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

// Import after mocking
import { containerApi, repoApi, configProfileApi } from '@/services/api'
import { claudeConfigApi } from '@/services/claudeConfigApi'

const mockContainerApi = vi.mocked(containerApi)
const mockRepoApi = vi.mocked(repoApi)
const mockConfigProfileApi = vi.mocked(configProfileApi)
const mockClaudeConfigApi = vi.mocked(claudeConfigApi)

// Test wrapper component
const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <BrowserRouter>{children}</BrowserRouter>
)

// Sample test data
const sampleClaudeConfigs: ClaudeConfigTemplate[] = [
  {
    id: 1,
    name: 'Project Overview',
    config_type: 'CLAUDE_MD',
    content: '# Project Overview',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
]

const sampleRepos = [
  {
    id: 1,
    name: 'test-repo',
    full_name: 'user/test-repo',
    clone_url: 'https://github.com/user/test-repo.git',
    private: false,
  },
]

describe('Dashboard - Container Create Dialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockContainerApi.list.mockResolvedValue({ data: [] })
    mockRepoApi.listRemote.mockResolvedValue({ data: sampleRepos })
    mockConfigProfileApi.listGitHubTokens.mockResolvedValue({ data: [] })
    mockConfigProfileApi.listEnvProfiles.mockResolvedValue({ data: [] })
    mockConfigProfileApi.listCommandProfiles.mockResolvedValue({ data: [] })
    mockClaudeConfigApi.list.mockResolvedValue({ data: sampleClaudeConfigs })
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  const openCreateDialog = async () => {
    render(
      <TestWrapper>
        <Dashboard />
      </TestWrapper>
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /New Container/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /New Container/i }))

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })
  }

  describe('Skip Git Repo Option', () => {
    it('should render skip git repo checkbox', async () => {
      await openCreateDialog()
      expect(screen.getByTestId('skip-git-repo-checkbox')).toBeInTheDocument()
      expect(screen.getByText(/Skip GitHub Repository/i)).toBeInTheDocument()
    })

    it('should hide repository selection when skip git repo is checked', async () => {
      await openCreateDialog()
      expect(screen.getByText('Repository Source')).toBeInTheDocument()

      const skipCheckbox = screen.getByTestId('skip-git-repo-checkbox')
      fireEvent.click(skipCheckbox)

      await waitFor(() => {
        expect(screen.queryByText('Repository Source')).not.toBeInTheDocument()
      })
    })

    it('should show repository selection when skip git repo is unchecked', async () => {
      await openCreateDialog()

      const skipCheckbox = screen.getByTestId('skip-git-repo-checkbox')
      fireEvent.click(skipCheckbox)

      await waitFor(() => {
        expect(screen.queryByText('Repository Source')).not.toBeInTheDocument()
      })

      fireEvent.click(skipCheckbox)

      await waitFor(() => {
        expect(screen.getByText('Repository Source')).toBeInTheDocument()
      })
    })

    it('should update info text when skip git repo is checked', async () => {
      await openCreateDialog()

      const skipCheckbox = screen.getByTestId('skip-git-repo-checkbox')
      fireEvent.click(skipCheckbox)

      await waitFor(() => {
        expect(screen.getByText(/Empty \/app directory will be created/i)).toBeInTheDocument()
      })
    })
  })

  describe('YOLO Mode Option', () => {
    it('should render YOLO mode checkbox', async () => {
      await openCreateDialog()
      expect(screen.getByTestId('yolo-mode-checkbox')).toBeInTheDocument()
      expect(screen.getByText(/Enable YOLO Mode/i)).toBeInTheDocument()
    })

    it('should show warning when YOLO mode is enabled', async () => {
      await openCreateDialog()
      expect(screen.queryByTestId('yolo-mode-warning')).not.toBeInTheDocument()

      const yoloCheckbox = screen.getByTestId('yolo-mode-checkbox')
      fireEvent.click(yoloCheckbox)

      await waitFor(() => {
        expect(screen.getByTestId('yolo-mode-warning')).toBeInTheDocument()
        expect(screen.getByText(/Warning: YOLO Mode Enabled/i)).toBeInTheDocument()
        expect(screen.getByText(/--dangerously-skip-permissions/i)).toBeInTheDocument()
      })
    })

    it('should hide warning when YOLO mode is disabled', async () => {
      await openCreateDialog()

      const yoloCheckbox = screen.getByTestId('yolo-mode-checkbox')
      fireEvent.click(yoloCheckbox)

      await waitFor(() => {
        expect(screen.getByTestId('yolo-mode-warning')).toBeInTheDocument()
      })

      fireEvent.click(yoloCheckbox)

      await waitFor(() => {
        expect(screen.queryByTestId('yolo-mode-warning')).not.toBeInTheDocument()
      })
    })
  })

  describe('Claude Tab', () => {
    it('should render Claude tab in the dialog', async () => {
      await openCreateDialog()
      const claudeTab = screen.getByRole('tab', { name: /Claude/i })
      expect(claudeTab).toBeInTheDocument()
    })

    it('should fetch claude configs when dialog opens', async () => {
      await openCreateDialog()
      await waitFor(() => {
        expect(mockClaudeConfigApi.list).toHaveBeenCalled()
      })
    })
  })

  describe('Form Submission', () => {
    it('should pass skipGitRepo and enableYoloMode when creating container', async () => {
      mockContainerApi.create.mockResolvedValue({ data: { id: 1 } })

      await openCreateDialog()

      const nameInput = screen.getByPlaceholderText('my-project')
      fireEvent.change(nameInput, { target: { value: 'test-container' } })

      const skipCheckbox = screen.getByTestId('skip-git-repo-checkbox')
      fireEvent.click(skipCheckbox)

      const yoloCheckbox = screen.getByTestId('yolo-mode-checkbox')
      fireEvent.click(yoloCheckbox)

      const createButton = screen.getByRole('button', { name: /^Create$/i })
      fireEvent.click(createButton)

      await waitFor(() => {
        expect(mockContainerApi.create).toHaveBeenCalledWith(
          'test-container',
          '',
          '',
          false,
          2048,
          1,
          [],
          undefined,
          false,
          undefined,
          undefined,
          undefined,
          true,
          true,
          {
            selected_claude_md: undefined,
            selected_skills: [],
            selected_mcps: [],
            selected_commands: [],
          }
        )
      })
    })
  })

  describe('Dialog Tabs', () => {
    it('should render all four tabs', async () => {
      await openCreateDialog()

      expect(screen.getByRole('tab', { name: /Basic/i })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: /Claude/i })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: /Resources/i })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: /Network/i })).toBeInTheDocument()
    })

    it('should have Basic tab as default active tab', async () => {
      await openCreateDialog()

      const basicTab = screen.getByRole('tab', { name: /Basic/i })
      expect(basicTab).toHaveAttribute('data-state', 'active')
    })
  })
})
