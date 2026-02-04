import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import Dashboard from '@/pages/Dashboard'
import type { InjectionStatus, FailedTemplate } from '@/types/claudeConfig'

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

// Mock the toast module - use inline functions that can be spied on
vi.mock('@/components/ui/toast', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}))

// Import after mocking
import { containerApi, repoApi, configProfileApi } from '@/services/api'
import { claudeConfigApi } from '@/services/claudeConfigApi'
import { toast } from '@/components/ui/toast'

const mockContainerApi = vi.mocked(containerApi)
const mockRepoApi = vi.mocked(repoApi)
const mockConfigProfileApi = vi.mocked(configProfileApi)
const mockClaudeConfigApi = vi.mocked(claudeConfigApi)
const mockToast = vi.mocked(toast)

// Test wrapper component
const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <BrowserRouter>{children}</BrowserRouter>
)

// Sample injection status data
const createInjectionStatus = (
  successful: string[] = [],
  failed: FailedTemplate[] = [],
  warnings: string[] = []
): InjectionStatus => ({
  container_id: '1',
  successful,
  failed,
  warnings,
  injected_at: '2024-01-01T00:00:00Z',
})

// Sample container data
const createContainer = (
  id: number,
  name: string,
  initStatus: string,
  injectionStatus?: InjectionStatus
) => ({
  id,
  docker_id: `docker-${id}`,
  name,
  status: 'running',
  init_status: initStatus,
  created_at: '2024-01-01T00:00:00Z',
  injection_status: injectionStatus,
})

describe('Dashboard - Injection Status Display', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRepoApi.listRemote.mockResolvedValue({ data: [] })
    mockConfigProfileApi.listGitHubTokens.mockResolvedValue({ data: [] })
    mockConfigProfileApi.listEnvProfiles.mockResolvedValue({ data: [] })
    mockConfigProfileApi.listCommandProfiles.mockResolvedValue({ data: [] })
    mockClaudeConfigApi.list.mockResolvedValue({ data: [] })
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('Injection Status Notification', () => {
    it('should show warning toast when container has failed configs', async () => {
      const failedConfigs: FailedTemplate[] = [
        { template_name: 'my-skill', config_type: 'SKILL', reason: 'File write error' },
        { template_name: 'my-mcp', config_type: 'MCP', reason: 'Invalid JSON' },
      ]
      const injectionStatus = createInjectionStatus(['project-overview'], failedConfigs)
      const container = createContainer(1, 'test-container', 'ready', injectionStatus)

      mockContainerApi.list.mockResolvedValue({ data: [container] })

      render(
        <TestWrapper>
          <Dashboard />
        </TestWrapper>
      )

      await waitFor(() => {
        expect(mockToast.warning).toHaveBeenCalledWith(
          'Config Injection Warning: test-container',
          '2 configuration(s) failed to inject: my-skill, my-mcp'
        )
      })
    })

    it('should not show warning toast when no failed configs', async () => {
      const injectionStatus = createInjectionStatus(['project-overview', 'my-skill'])
      const container = createContainer(1, 'test-container', 'ready', injectionStatus)

      mockContainerApi.list.mockResolvedValue({ data: [container] })

      render(
        <TestWrapper>
          <Dashboard />
        </TestWrapper>
      )

      await waitFor(() => {
        expect(screen.getByText('test-container')).toBeInTheDocument()
      })

      expect(mockToast.warning).not.toHaveBeenCalled()
    })

    it('should not show notification for containers still initializing', async () => {
      const failedConfigs: FailedTemplate[] = [
        { template_name: 'my-skill', config_type: 'SKILL', reason: 'Error' },
      ]
      const injectionStatus = createInjectionStatus([], failedConfigs)
      const container = createContainer(1, 'test-container', 'initializing', injectionStatus)

      mockContainerApi.list.mockResolvedValue({ data: [container] })

      render(
        <TestWrapper>
          <Dashboard />
        </TestWrapper>
      )

      await waitFor(() => {
        expect(screen.getByText('test-container')).toBeInTheDocument()
      })

      expect(mockToast.warning).not.toHaveBeenCalled()
    })

    it('should show info toast when container has warnings', async () => {
      const injectionStatus = createInjectionStatus(
        ['project-overview'],
        [],
        ['Some config was skipped', 'Another warning']
      )
      const container = createContainer(1, 'test-container', 'ready', injectionStatus)

      mockContainerApi.list.mockResolvedValue({ data: [container] })

      render(
        <TestWrapper>
          <Dashboard />
        </TestWrapper>
      )

      await waitFor(() => {
        expect(mockToast.info).toHaveBeenCalledWith(
          'Config Injection Info: test-container',
          'Some config was skipped; Another warning'
        )
      })
    })

    it('should only show notification once per container', async () => {
      const failedConfigs: FailedTemplate[] = [
        { template_name: 'my-skill', config_type: 'SKILL', reason: 'Error' },
      ]
      const injectionStatus = createInjectionStatus(['project-overview'], failedConfigs)
      const container = createContainer(1, 'test-container', 'ready', injectionStatus)

      mockContainerApi.list.mockResolvedValue({ data: [container] })

      const { rerender } = render(
        <TestWrapper>
          <Dashboard />
        </TestWrapper>
      )

      await waitFor(() => {
        expect(mockToast.warning).toHaveBeenCalledTimes(1)
      })

      // Rerender to simulate polling
      rerender(
        <TestWrapper>
          <Dashboard />
        </TestWrapper>
      )

      // Should still only be called once
      expect(mockToast.warning).toHaveBeenCalledTimes(1)
    })
  })

  describe('Injection Status Indicator in Container Card', () => {
    it('should display injection status indicator for ready container with configs', async () => {
      const injectionStatus = createInjectionStatus(['project-overview', 'my-skill'])
      const container = createContainer(1, 'test-container', 'ready', injectionStatus)

      mockContainerApi.list.mockResolvedValue({ data: [container] })

      render(
        <TestWrapper>
          <Dashboard />
        </TestWrapper>
      )

      await waitFor(() => {
        expect(screen.getByTestId('injection-status-indicator')).toBeInTheDocument()
      })

      expect(screen.getByText('2 config(s) injected')).toBeInTheDocument()
    })

    it('should display failed count when configs failed', async () => {
      const failedConfigs: FailedTemplate[] = [
        { template_name: 'my-skill', config_type: 'SKILL', reason: 'Error' },
      ]
      const injectionStatus = createInjectionStatus(['project-overview'], failedConfigs)
      const container = createContainer(1, 'test-container', 'ready', injectionStatus)

      mockContainerApi.list.mockResolvedValue({ data: [container] })

      render(
        <TestWrapper>
          <Dashboard />
        </TestWrapper>
      )

      await waitFor(() => {
        expect(screen.getByTestId('injection-status-indicator')).toBeInTheDocument()
      })

      expect(screen.getByText('1 config(s) failed')).toBeInTheDocument()
    })

    it('should not display indicator for container without injection status', async () => {
      const container = createContainer(1, 'test-container', 'ready')

      mockContainerApi.list.mockResolvedValue({ data: [container] })

      render(
        <TestWrapper>
          <Dashboard />
        </TestWrapper>
      )

      await waitFor(() => {
        expect(screen.getByText('test-container')).toBeInTheDocument()
      })

      expect(screen.queryByTestId('injection-status-indicator')).not.toBeInTheDocument()
    })

    it('should not display indicator for initializing container', async () => {
      const injectionStatus = createInjectionStatus(['project-overview'])
      const container = createContainer(1, 'test-container', 'initializing', injectionStatus)

      mockContainerApi.list.mockResolvedValue({ data: [container] })

      render(
        <TestWrapper>
          <Dashboard />
        </TestWrapper>
      )

      await waitFor(() => {
        expect(screen.getByText('test-container')).toBeInTheDocument()
      })

      expect(screen.queryByTestId('injection-status-indicator')).not.toBeInTheDocument()
    })
  })

  describe('Injection Status Tooltip Details', () => {
    it('should render tooltip trigger with correct data for successful configs', async () => {
      const injectionStatus = createInjectionStatus(['project-overview', 'my-skill'])
      const container = createContainer(1, 'test-container', 'ready', injectionStatus)

      mockContainerApi.list.mockResolvedValue({ data: [container] })

      render(
        <TestWrapper>
          <Dashboard />
        </TestWrapper>
      )

      await waitFor(() => {
        expect(screen.getByTestId('injection-status-indicator')).toBeInTheDocument()
      })

      // Verify the indicator shows the correct count
      expect(screen.getByText('2 config(s) injected')).toBeInTheDocument()
    })

    it('should render tooltip trigger with correct data for failed configs', async () => {
      const failedConfigs: FailedTemplate[] = [
        { template_name: 'my-mcp', config_type: 'MCP', reason: 'Invalid JSON format' },
      ]
      const injectionStatus = createInjectionStatus(['project-overview'], failedConfigs)
      const container = createContainer(1, 'test-container', 'ready', injectionStatus)

      mockContainerApi.list.mockResolvedValue({ data: [container] })

      render(
        <TestWrapper>
          <Dashboard />
        </TestWrapper>
      )

      await waitFor(() => {
        expect(screen.getByTestId('injection-status-indicator')).toBeInTheDocument()
      })

      // Verify the indicator shows the failed count
      expect(screen.getByText('1 config(s) failed')).toBeInTheDocument()
    })

    it('should render tooltip trigger for container with warnings', async () => {
      const injectionStatus = createInjectionStatus(
        ['project-overview'],
        [],
        ['Config file was overwritten']
      )
      const container = createContainer(1, 'test-container', 'ready', injectionStatus)

      mockContainerApi.list.mockResolvedValue({ data: [container] })

      render(
        <TestWrapper>
          <Dashboard />
        </TestWrapper>
      )

      await waitFor(() => {
        expect(screen.getByTestId('injection-status-indicator')).toBeInTheDocument()
      })

      // Verify the indicator shows successful count (warnings don't change the indicator)
      expect(screen.getByText('1 config(s) injected')).toBeInTheDocument()
    })
  })
})
