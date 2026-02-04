import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import ClaudeConfig from '@/pages/ClaudeConfig'
import type { ClaudeConfigTemplate } from '@/types/claudeConfig'

// Mock the claudeConfigApi module
vi.mock('@/services/claudeConfigApi', () => ({
  claudeConfigApi: {
    list: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
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
import { claudeConfigApi } from '@/services/claudeConfigApi'
import { toast } from '@/components/ui/toast'

const mockClaudeConfigApi = vi.mocked(claudeConfigApi)
const mockToast = vi.mocked(toast)

// Test wrapper component
const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <BrowserRouter>{children}</BrowserRouter>
)

// Sample test data
const sampleTemplates: Record<string, ClaudeConfigTemplate[]> = {
  CLAUDE_MD: [
    {
      id: 1,
      name: 'Project Overview',
      config_type: 'CLAUDE_MD',
      content: '# Project Overview\n\nThis is a test project.',
      description: 'Main project documentation',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    },
  ],
  SKILL: [
    {
      id: 2,
      name: 'Code Review Skill',
      config_type: 'SKILL',
      content: '---\nallowed_tools:\n  - Read\n  - Write\n---\n\n# Code Review',
      description: 'Skill for code review',
      created_at: '2024-01-02T00:00:00Z',
      updated_at: '2024-01-02T00:00:00Z',
    },
  ],
  MCP: [
    {
      id: 3,
      name: 'GitHub MCP',
      config_type: 'MCP',
      content: '{"command": "npx", "args": ["-y", "@modelcontextprotocol/server-github"]}',
      description: 'GitHub MCP server',
      created_at: '2024-01-03T00:00:00Z',
      updated_at: '2024-01-03T00:00:00Z',
    },
  ],
  COMMAND: [
    {
      id: 4,
      name: 'Deploy Command',
      config_type: 'COMMAND',
      content: '# Deploy\n\nDeploy the application to production.',
      description: 'Deployment command',
      created_at: '2024-01-04T00:00:00Z',
      updated_at: '2024-01-04T00:00:00Z',
    },
  ],
}

describe('ClaudeConfig Page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Setup default mock responses
    mockClaudeConfigApi.list.mockImplementation((type) => {
      const templates = type ? sampleTemplates[type] || [] : []
      return Promise.resolve({ data: templates })
    })
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('Tab Rendering', () => {
    it('should render all four tabs correctly', async () => {
      render(
        <TestWrapper>
          <ClaudeConfig />
        </TestWrapper>
      )

      // Check all tabs are rendered
      expect(screen.getByRole('tab', { name: /CLAUDE\.MD/i })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: /Skills/i })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: /MCP/i })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: /Commands/i })).toBeInTheDocument()
    })

    it('should show CLAUDE.MD tab as default active tab', async () => {
      render(
        <TestWrapper>
          <ClaudeConfig />
        </TestWrapper>
      )

      const claudeMdTab = screen.getByRole('tab', { name: /CLAUDE\.MD/i })
      expect(claudeMdTab).toHaveAttribute('data-state', 'active')
    })

    it('should render all tabs with correct icons', () => {
      render(
        <TestWrapper>
          <ClaudeConfig />
        </TestWrapper>
      )

      // Verify tabs have icons (lucide icons)
      const tabs = screen.getAllByRole('tab')
      expect(tabs.length).toBe(4)
      tabs.forEach(tab => {
        expect(tab.querySelector('svg')).toBeInTheDocument()
      })
    })
  })

  describe('Template List', () => {
    it('should show empty state when no templates exist', async () => {
      mockClaudeConfigApi.list.mockResolvedValue({ data: [] })

      render(
        <TestWrapper>
          <ClaudeConfig />
        </TestWrapper>
      )

      await waitFor(() => {
        expect(screen.getByText(/No claude\.md templates configured/i)).toBeInTheDocument()
      })
    })

    it('should display template data when templates exist', async () => {
      render(
        <TestWrapper>
          <ClaudeConfig />
        </TestWrapper>
      )

      await waitFor(() => {
        // Use getAllByText since template name appears in both desktop table and mobile cards
        const elements = screen.getAllByText('Project Overview')
        expect(elements.length).toBeGreaterThan(0)
      })
    })

    it('should display template description', async () => {
      render(
        <TestWrapper>
          <ClaudeConfig />
        </TestWrapper>
      )

      await waitFor(() => {
        // Use getAllByText since description appears in both desktop table and mobile cards
        const elements = screen.getAllByText('Main project documentation')
        expect(elements.length).toBeGreaterThan(0)
      })
    })

    it('should show error toast when loading fails', async () => {
      mockClaudeConfigApi.list.mockRejectedValue(new Error('Network error'))

      render(
        <TestWrapper>
          <ClaudeConfig />
        </TestWrapper>
      )

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith('Error', expect.stringContaining('Failed to load'))
      })
    })

    it('should call list API for each config type on mount', async () => {
      render(
        <TestWrapper>
          <ClaudeConfig />
        </TestWrapper>
      )

      await waitFor(() => {
        expect(mockClaudeConfigApi.list).toHaveBeenCalledWith('CLAUDE_MD')
        expect(mockClaudeConfigApi.list).toHaveBeenCalledWith('SKILL')
        expect(mockClaudeConfigApi.list).toHaveBeenCalledWith('MCP')
        expect(mockClaudeConfigApi.list).toHaveBeenCalledWith('COMMAND')
      })
    })
  })

  describe('Button Interactions', () => {
    it('should render Create Template button', async () => {
      render(
        <TestWrapper>
          <ClaudeConfig />
        </TestWrapper>
      )

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Create Template/i })).toBeInTheDocument()
      })
    })

    it('should open create dialog when Create Template button is clicked', async () => {
      render(
        <TestWrapper>
          <ClaudeConfig />
        </TestWrapper>
      )

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Create Template/i })).toBeInTheDocument()
      })

      const createButton = screen.getByRole('button', { name: /Create Template/i })
      fireEvent.click(createButton)

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument()
        expect(screen.getByText(/Create Template/i, { selector: 'h2' })).toBeInTheDocument()
      })
    })

    it('should render edit and delete buttons for each template', async () => {
      render(
        <TestWrapper>
          <ClaudeConfig />
        </TestWrapper>
      )

      await waitFor(() => {
        const elements = screen.getAllByText('Project Overview')
        expect(elements.length).toBeGreaterThan(0)
      })

      // Find edit buttons (Pencil icon buttons)
      const editButtons = screen.getAllByRole('button').filter(btn => 
        btn.querySelector('svg.lucide-pencil')
      )
      expect(editButtons.length).toBeGreaterThan(0)

      // Find delete buttons (Trash2 icon buttons)
      const deleteButtons = screen.getAllByRole('button').filter(btn => 
        btn.querySelector('svg.lucide-trash-2')
      )
      expect(deleteButtons.length).toBeGreaterThan(0)
    })

    it('should open edit dialog when edit button is clicked', async () => {
      render(
        <TestWrapper>
          <ClaudeConfig />
        </TestWrapper>
      )

      await waitFor(() => {
        const elements = screen.getAllByText('Project Overview')
        expect(elements.length).toBeGreaterThan(0)
      })

      // Find and click edit button
      const editButtons = screen.getAllByRole('button').filter(btn => 
        btn.querySelector('svg.lucide-pencil')
      )
      fireEvent.click(editButtons[0])

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument()
        expect(screen.getByText(/Edit Template/i, { selector: 'h2' })).toBeInTheDocument()
      })
    })

    it('should open delete confirmation dialog when delete button is clicked', async () => {
      render(
        <TestWrapper>
          <ClaudeConfig />
        </TestWrapper>
      )

      await waitFor(() => {
        const elements = screen.getAllByText('Project Overview')
        expect(elements.length).toBeGreaterThan(0)
      })

      // Find and click delete button
      const deleteButtons = screen.getAllByRole('button').filter(btn => 
        btn.querySelector('svg.lucide-trash-2')
      )
      fireEvent.click(deleteButtons[0])

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument()
        expect(screen.getByText(/Delete Template/i, { selector: 'h2' })).toBeInTheDocument()
        expect(screen.getByText(/Are you sure you want to delete/i)).toBeInTheDocument()
      })
    })

    it('should call delete API when delete is confirmed', async () => {
      mockClaudeConfigApi.delete.mockResolvedValue({})

      render(
        <TestWrapper>
          <ClaudeConfig />
        </TestWrapper>
      )

      await waitFor(() => {
        const elements = screen.getAllByText('Project Overview')
        expect(elements.length).toBeGreaterThan(0)
      })

      // Find and click delete button
      const deleteButtons = screen.getAllByRole('button').filter(btn => 
        btn.querySelector('svg.lucide-trash-2')
      )
      fireEvent.click(deleteButtons[0])

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument()
      })

      // Click confirm delete button
      const confirmDeleteButton = screen.getByRole('button', { name: /^Delete$/i })
      fireEvent.click(confirmDeleteButton)

      await waitFor(() => {
        expect(mockClaudeConfigApi.delete).toHaveBeenCalledWith(1)
        expect(mockToast.success).toHaveBeenCalledWith('Success', 'Template deleted')
      })
    })

    it('should close delete dialog when cancel is clicked', async () => {
      render(
        <TestWrapper>
          <ClaudeConfig />
        </TestWrapper>
      )

      await waitFor(() => {
        const elements = screen.getAllByText('Project Overview')
        expect(elements.length).toBeGreaterThan(0)
      })

      // Find and click delete button
      const deleteButtons = screen.getAllByRole('button').filter(btn => 
        btn.querySelector('svg.lucide-trash-2')
      )
      fireEvent.click(deleteButtons[0])

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument()
      })

      // Click cancel button
      const cancelButton = screen.getByRole('button', { name: /Cancel/i })
      fireEvent.click(cancelButton)

      await waitFor(() => {
        expect(screen.queryByText(/Are you sure you want to delete/i)).not.toBeInTheDocument()
      })
    })
  })

  describe('Create/Edit Dialog', () => {
    it('should validate required name field', async () => {
      render(
        <TestWrapper>
          <ClaudeConfig />
        </TestWrapper>
      )

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Create Template/i })).toBeInTheDocument()
      })

      // Open create dialog
      fireEvent.click(screen.getByRole('button', { name: /Create Template/i }))

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument()
      })

      // Try to save without name
      const createButton = screen.getByRole('button', { name: /^Create$/i })
      fireEvent.click(createButton)

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith('Error', 'Name is required')
      })
    })

    it('should validate required content field', async () => {
      render(
        <TestWrapper>
          <ClaudeConfig />
        </TestWrapper>
      )

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Create Template/i })).toBeInTheDocument()
      })

      // Open create dialog
      fireEvent.click(screen.getByRole('button', { name: /Create Template/i }))

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument()
      })

      // Fill in name but not content
      const nameInput = screen.getByLabelText(/Name/i)
      fireEvent.change(nameInput, { target: { value: 'Test Template' } })

      // Try to save without content
      const createButton = screen.getByRole('button', { name: /^Create$/i })
      fireEvent.click(createButton)

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith('Error', 'Content is required')
      })
    })

    it('should call create API with correct data', async () => {
      mockClaudeConfigApi.create.mockResolvedValue({
        data: {
          id: 10,
          name: 'New Template',
          config_type: 'CLAUDE_MD',
          content: '# New Content',
          description: 'New description',
          created_at: '2024-01-10T00:00:00Z',
          updated_at: '2024-01-10T00:00:00Z',
        },
      })

      render(
        <TestWrapper>
          <ClaudeConfig />
        </TestWrapper>
      )

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Create Template/i })).toBeInTheDocument()
      })

      // Open create dialog
      fireEvent.click(screen.getByRole('button', { name: /Create Template/i }))

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument()
      })

      // Fill in form
      const nameInput = screen.getByLabelText(/Name/i)
      const contentInput = screen.getByLabelText(/Content/i)
      
      fireEvent.change(nameInput, { target: { value: 'New Template' } })
      fireEvent.change(contentInput, { target: { value: '# New Content' } })

      // Submit
      const createButton = screen.getByRole('button', { name: /^Create$/i })
      fireEvent.click(createButton)

      await waitFor(() => {
        expect(mockClaudeConfigApi.create).toHaveBeenCalledWith({
          name: 'New Template',
          config_type: 'CLAUDE_MD',
          content: '# New Content',
          description: '',
        })
        expect(mockToast.success).toHaveBeenCalledWith('Success', 'Template created')
      })
    })
  })

  describe('Page Header', () => {
    it('should render page title', () => {
      render(
        <TestWrapper>
          <ClaudeConfig />
        </TestWrapper>
      )

      expect(screen.getByText('Claude Config')).toBeInTheDocument()
    })

    it('should render page description', () => {
      render(
        <TestWrapper>
          <ClaudeConfig />
        </TestWrapper>
      )

      expect(screen.getByText('Manage Claude Code configuration templates')).toBeInTheDocument()
    })
  })
})
