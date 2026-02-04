import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ConfigTemplateEditor, { validateFileType } from '@/components/ConfigTemplateEditor'
import type { ClaudeConfigTemplate, ConfigType } from '@/types/claudeConfig'
import { ConfigTypes } from '@/types/claudeConfig'

// Mock the toast module
vi.mock('@/components/ui/toast', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

// Sample test data
const sampleTemplate: ClaudeConfigTemplate = {
  id: 1,
  name: 'Test Template',
  config_type: 'CLAUDE_MD',
  content: '# Test Content\n\nThis is test content.',
  description: 'Test description',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
}

const sampleMCPTemplate: ClaudeConfigTemplate = {
  id: 2,
  name: 'MCP Template',
  config_type: 'MCP',
  content: '{"command": "npx", "args": ["-y", "@test/server"]}',
  description: 'MCP description',
  created_at: '2024-01-02T00:00:00Z',
  updated_at: '2024-01-02T00:00:00Z',
}

describe('ConfigTemplateEditor', () => {
  let mockOnSave: ReturnType<typeof vi.fn>
  let mockOnOpenChange: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockOnSave = vi.fn().mockResolvedValue(undefined)
    mockOnOpenChange = vi.fn()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Dialog Open/Close', () => {
    it('should render dialog when open is true', () => {
      render(
        <ConfigTemplateEditor
          open={true}
          onOpenChange={mockOnOpenChange}
          configType={ConfigTypes.CLAUDE_MD}
          onSave={mockOnSave}
        />
      )

      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    it('should not render dialog when open is false', () => {
      render(
        <ConfigTemplateEditor
          open={false}
          onOpenChange={mockOnOpenChange}
          configType={ConfigTypes.CLAUDE_MD}
          onSave={mockOnSave}
        />
      )

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('should call onOpenChange when Cancel button is clicked', async () => {
      render(
        <ConfigTemplateEditor
          open={true}
          onOpenChange={mockOnOpenChange}
          configType={ConfigTypes.CLAUDE_MD}
          onSave={mockOnSave}
        />
      )

      const cancelButton = screen.getByRole('button', { name: /Cancel/i })
      fireEvent.click(cancelButton)

      expect(mockOnOpenChange).toHaveBeenCalledWith(false)
    })

    it('should show "Create Template" title when no template is provided', () => {
      render(
        <ConfigTemplateEditor
          open={true}
          onOpenChange={mockOnOpenChange}
          configType={ConfigTypes.CLAUDE_MD}
          onSave={mockOnSave}
        />
      )

      expect(screen.getByText('Create Template')).toBeInTheDocument()
    })

    it('should show "Edit Template" title when template is provided', () => {
      render(
        <ConfigTemplateEditor
          open={true}
          onOpenChange={mockOnOpenChange}
          template={sampleTemplate}
          configType={ConfigTypes.CLAUDE_MD}
          onSave={mockOnSave}
        />
      )

      expect(screen.getByText('Edit Template')).toBeInTheDocument()
    })

    it('should populate form with template data when editing', () => {
      render(
        <ConfigTemplateEditor
          open={true}
          onOpenChange={mockOnOpenChange}
          template={sampleTemplate}
          configType={ConfigTypes.CLAUDE_MD}
          onSave={mockOnSave}
        />
      )

      expect(screen.getByLabelText(/Name/i)).toHaveValue('Test Template')
      expect(screen.getByLabelText(/Description/i)).toHaveValue('Test description')
      expect(screen.getByTestId('content-editor')).toHaveValue('# Test Content\n\nThis is test content.')
    })

    it('should reset form when dialog opens for create', async () => {
      const { rerender } = render(
        <ConfigTemplateEditor
          open={false}
          onOpenChange={mockOnOpenChange}
          configType={ConfigTypes.CLAUDE_MD}
          onSave={mockOnSave}
        />
      )

      rerender(
        <ConfigTemplateEditor
          open={true}
          onOpenChange={mockOnOpenChange}
          configType={ConfigTypes.CLAUDE_MD}
          onSave={mockOnSave}
        />
      )

      expect(screen.getByLabelText(/Name/i)).toHaveValue('')
      expect(screen.getByLabelText(/Description/i)).toHaveValue('')
      expect(screen.getByTestId('content-editor')).toHaveValue('')
    })
  })

  describe('Syntax Highlighting Indicator', () => {
    it('should show Markdown indicator for CLAUDE_MD type', () => {
      render(
        <ConfigTemplateEditor
          open={true}
          onOpenChange={mockOnOpenChange}
          configType={ConfigTypes.CLAUDE_MD}
          onSave={mockOnSave}
        />
      )

      const syntaxIndicator = screen.getByTestId('syntax-indicator')
      expect(syntaxIndicator).toHaveTextContent('Markdown')
    })

    it('should show Markdown indicator for SKILL type', () => {
      render(
        <ConfigTemplateEditor
          open={true}
          onOpenChange={mockOnOpenChange}
          configType={ConfigTypes.SKILL}
          onSave={mockOnSave}
        />
      )

      const syntaxIndicator = screen.getByTestId('syntax-indicator')
      expect(syntaxIndicator).toHaveTextContent('Markdown')
    })

    it('should show Markdown indicator for COMMAND type', () => {
      render(
        <ConfigTemplateEditor
          open={true}
          onOpenChange={mockOnOpenChange}
          configType={ConfigTypes.COMMAND}
          onSave={mockOnSave}
        />
      )

      const syntaxIndicator = screen.getByTestId('syntax-indicator')
      expect(syntaxIndicator).toHaveTextContent('Markdown')
    })

    it('should show JSON indicator for MCP type', () => {
      render(
        <ConfigTemplateEditor
          open={true}
          onOpenChange={mockOnOpenChange}
          configType={ConfigTypes.MCP}
          onSave={mockOnSave}
        />
      )

      const syntaxIndicator = screen.getByTestId('syntax-indicator')
      expect(syntaxIndicator).toHaveTextContent('JSON')
    })

    it('should set data-syntax attribute on content editor', () => {
      render(
        <ConfigTemplateEditor
          open={true}
          onOpenChange={mockOnOpenChange}
          configType={ConfigTypes.MCP}
          onSave={mockOnSave}
        />
      )

      const contentEditor = screen.getByTestId('content-editor')
      expect(contentEditor).toHaveAttribute('data-syntax', 'json')
    })
  })

  describe('Form Validation', () => {
    it('should show error when name is empty', async () => {
      render(
        <ConfigTemplateEditor
          open={true}
          onOpenChange={mockOnOpenChange}
          configType={ConfigTypes.CLAUDE_MD}
          onSave={mockOnSave}
        />
      )

      // Fill content but not name
      const contentEditor = screen.getByTestId('content-editor')
      fireEvent.change(contentEditor, { target: { value: '# Content' } })

      // Try to save
      const saveButton = screen.getByTestId('save-button')
      fireEvent.click(saveButton)

      await waitFor(() => {
        expect(screen.getByText('Name is required')).toBeInTheDocument()
      })
      expect(mockOnSave).not.toHaveBeenCalled()
    })

    it('should show error when content is empty', async () => {
      render(
        <ConfigTemplateEditor
          open={true}
          onOpenChange={mockOnOpenChange}
          configType={ConfigTypes.CLAUDE_MD}
          onSave={mockOnSave}
        />
      )

      // Fill name but not content
      const nameInput = screen.getByLabelText(/Name/i)
      fireEvent.change(nameInput, { target: { value: 'Test Name' } })

      // Try to save
      const saveButton = screen.getByTestId('save-button')
      fireEvent.click(saveButton)

      await waitFor(() => {
        expect(screen.getByText('Content is required')).toBeInTheDocument()
      })
      expect(mockOnSave).not.toHaveBeenCalled()
    })

    it('should show error for invalid JSON in MCP type', async () => {
      render(
        <ConfigTemplateEditor
          open={true}
          onOpenChange={mockOnOpenChange}
          configType={ConfigTypes.MCP}
          onSave={mockOnSave}
        />
      )

      // Fill name and invalid JSON content
      const nameInput = screen.getByLabelText(/Name/i)
      fireEvent.change(nameInput, { target: { value: 'Test MCP' } })

      const contentEditor = screen.getByTestId('content-editor')
      fireEvent.change(contentEditor, { target: { value: 'not valid json' } })

      // Try to save
      const saveButton = screen.getByTestId('save-button')
      fireEvent.click(saveButton)

      await waitFor(() => {
        expect(screen.getByText('Invalid JSON format')).toBeInTheDocument()
      })
      expect(mockOnSave).not.toHaveBeenCalled()
    })

    it('should show error for MCP JSON missing command field', async () => {
      render(
        <ConfigTemplateEditor
          open={true}
          onOpenChange={mockOnOpenChange}
          configType={ConfigTypes.MCP}
          onSave={mockOnSave}
        />
      )

      // Fill name and JSON without command
      const nameInput = screen.getByLabelText(/Name/i)
      fireEvent.change(nameInput, { target: { value: 'Test MCP' } })

      const contentEditor = screen.getByTestId('content-editor')
      fireEvent.change(contentEditor, { target: { value: '{"args": []}' } })

      // Try to save
      const saveButton = screen.getByTestId('save-button')
      fireEvent.click(saveButton)

      await waitFor(() => {
        expect(screen.getByText(/must have a "command" field/i)).toBeInTheDocument()
      })
      expect(mockOnSave).not.toHaveBeenCalled()
    })

    it('should show error for MCP JSON missing args field', async () => {
      render(
        <ConfigTemplateEditor
          open={true}
          onOpenChange={mockOnOpenChange}
          configType={ConfigTypes.MCP}
          onSave={mockOnSave}
        />
      )

      // Fill name and JSON without args
      const nameInput = screen.getByLabelText(/Name/i)
      fireEvent.change(nameInput, { target: { value: 'Test MCP' } })

      const contentEditor = screen.getByTestId('content-editor')
      fireEvent.change(contentEditor, { target: { value: '{"command": "npx"}' } })

      // Try to save
      const saveButton = screen.getByTestId('save-button')
      fireEvent.click(saveButton)

      await waitFor(() => {
        expect(screen.getByText(/must have an "args" field/i)).toBeInTheDocument()
      })
      expect(mockOnSave).not.toHaveBeenCalled()
    })

    it('should clear name error when user types', async () => {
      render(
        <ConfigTemplateEditor
          open={true}
          onOpenChange={mockOnOpenChange}
          configType={ConfigTypes.CLAUDE_MD}
          onSave={mockOnSave}
        />
      )

      // Trigger validation error
      const saveButton = screen.getByTestId('save-button')
      fireEvent.click(saveButton)

      await waitFor(() => {
        expect(screen.getByText('Name is required')).toBeInTheDocument()
      })

      // Type in name field
      const nameInput = screen.getByLabelText(/Name/i)
      fireEvent.change(nameInput, { target: { value: 'New Name' } })

      await waitFor(() => {
        expect(screen.queryByText('Name is required')).not.toBeInTheDocument()
      })
    })

    it('should clear content error when user types', async () => {
      render(
        <ConfigTemplateEditor
          open={true}
          onOpenChange={mockOnOpenChange}
          configType={ConfigTypes.CLAUDE_MD}
          onSave={mockOnSave}
        />
      )

      // Fill name and trigger content validation error
      const nameInput = screen.getByLabelText(/Name/i)
      fireEvent.change(nameInput, { target: { value: 'Test Name' } })

      const saveButton = screen.getByTestId('save-button')
      fireEvent.click(saveButton)

      await waitFor(() => {
        expect(screen.getByText('Content is required')).toBeInTheDocument()
      })

      // Type in content field
      const contentEditor = screen.getByTestId('content-editor')
      fireEvent.change(contentEditor, { target: { value: '# Content' } })

      await waitFor(() => {
        expect(screen.queryByText('Content is required')).not.toBeInTheDocument()
      })
    })

    it('should call onSave with correct data when form is valid', async () => {
      render(
        <ConfigTemplateEditor
          open={true}
          onOpenChange={mockOnOpenChange}
          configType={ConfigTypes.CLAUDE_MD}
          onSave={mockOnSave}
        />
      )

      // Fill form
      const nameInput = screen.getByLabelText(/Name/i)
      fireEvent.change(nameInput, { target: { value: 'Test Template' } })

      const descInput = screen.getByLabelText(/Description/i)
      fireEvent.change(descInput, { target: { value: 'Test description' } })

      const contentEditor = screen.getByTestId('content-editor')
      fireEvent.change(contentEditor, { target: { value: '# Test Content' } })

      // Save
      const saveButton = screen.getByTestId('save-button')
      fireEvent.click(saveButton)

      await waitFor(() => {
        expect(mockOnSave).toHaveBeenCalledWith({
          name: 'Test Template',
          config_type: 'CLAUDE_MD',
          content: '# Test Content',
          description: 'Test description',
        })
      })
    })

    it('should accept valid MCP JSON content', async () => {
      render(
        <ConfigTemplateEditor
          open={true}
          onOpenChange={mockOnOpenChange}
          configType={ConfigTypes.MCP}
          onSave={mockOnSave}
        />
      )

      // Fill form with valid MCP JSON
      const nameInput = screen.getByLabelText(/Name/i)
      fireEvent.change(nameInput, { target: { value: 'Test MCP' } })

      const contentEditor = screen.getByTestId('content-editor')
      fireEvent.change(contentEditor, { target: { value: '{"command": "npx", "args": ["-y", "@test/server"]}' } })

      // Save
      const saveButton = screen.getByTestId('save-button')
      fireEvent.click(saveButton)

      await waitFor(() => {
        expect(mockOnSave).toHaveBeenCalled()
      })
    })
  })

  describe('File Upload', () => {
    it('should render upload button', () => {
      render(
        <ConfigTemplateEditor
          open={true}
          onOpenChange={mockOnOpenChange}
          configType={ConfigTypes.CLAUDE_MD}
          onSave={mockOnSave}
        />
      )

      expect(screen.getByTestId('upload-button')).toBeInTheDocument()
    })

    it('should accept .md files for CLAUDE_MD type', () => {
      render(
        <ConfigTemplateEditor
          open={true}
          onOpenChange={mockOnOpenChange}
          configType={ConfigTypes.CLAUDE_MD}
          onSave={mockOnSave}
        />
      )

      const fileInput = screen.getByTestId('file-input')
      expect(fileInput).toHaveAttribute('accept', '.md')
    })

    it('should accept .md files for SKILL type', () => {
      render(
        <ConfigTemplateEditor
          open={true}
          onOpenChange={mockOnOpenChange}
          configType={ConfigTypes.SKILL}
          onSave={mockOnSave}
        />
      )

      const fileInput = screen.getByTestId('file-input')
      expect(fileInput).toHaveAttribute('accept', '.md')
    })

    it('should accept .json files for MCP type', () => {
      render(
        <ConfigTemplateEditor
          open={true}
          onOpenChange={mockOnOpenChange}
          configType={ConfigTypes.MCP}
          onSave={mockOnSave}
        />
      )

      const fileInput = screen.getByTestId('file-input')
      expect(fileInput).toHaveAttribute('accept', '.json')
    })

    it('should show error for invalid file type (json file for markdown type)', async () => {
      render(
        <ConfigTemplateEditor
          open={true}
          onOpenChange={mockOnOpenChange}
          configType={ConfigTypes.CLAUDE_MD}
          onSave={mockOnSave}
        />
      )

      const fileInput = screen.getByTestId('file-input')
      const file = new File(['{"test": true}'], 'test.json', { type: 'application/json' })

      fireEvent.change(fileInput, { target: { files: [file] } })

      await waitFor(() => {
        expect(screen.getByTestId('file-error')).toHaveTextContent(/Invalid file type.*\.md/i)
      })
    })

    it('should show error for invalid file type (md file for MCP type)', async () => {
      render(
        <ConfigTemplateEditor
          open={true}
          onOpenChange={mockOnOpenChange}
          configType={ConfigTypes.MCP}
          onSave={mockOnSave}
        />
      )

      const fileInput = screen.getByTestId('file-input')
      const file = new File(['# Test'], 'test.md', { type: 'text/markdown' })

      fireEvent.change(fileInput, { target: { files: [file] } })

      await waitFor(() => {
        expect(screen.getByTestId('file-error')).toHaveTextContent(/Invalid file type.*\.json/i)
      })
    })

    it('should populate form with uploaded markdown file content', async () => {
      render(
        <ConfigTemplateEditor
          open={true}
          onOpenChange={mockOnOpenChange}
          configType={ConfigTypes.CLAUDE_MD}
          onSave={mockOnSave}
        />
      )

      const fileInput = screen.getByTestId('file-input')
      const fileContent = '# Uploaded Content\n\nThis is from a file.'
      const file = new File([fileContent], 'test-file.md', { type: 'text/markdown' })

      fireEvent.change(fileInput, { target: { files: [file] } })

      await waitFor(() => {
        expect(screen.getByTestId('content-editor')).toHaveValue(fileContent)
        // Should use filename without extension as name
        expect(screen.getByLabelText(/Name/i)).toHaveValue('test-file')
      })
    })

    it('should populate form with uploaded JSON file content', async () => {
      render(
        <ConfigTemplateEditor
          open={true}
          onOpenChange={mockOnOpenChange}
          configType={ConfigTypes.MCP}
          onSave={mockOnSave}
        />
      )

      const fileInput = screen.getByTestId('file-input')
      const fileContent = '{"command": "npx", "args": ["-y", "@test/server"]}'
      const file = new File([fileContent], 'mcp-config.json', { type: 'application/json' })

      fireEvent.change(fileInput, { target: { files: [file] } })

      await waitFor(() => {
        expect(screen.getByTestId('content-editor')).toHaveValue(fileContent)
        expect(screen.getByLabelText(/Name/i)).toHaveValue('mcp-config')
      })
    })

    it('should not overwrite existing name when uploading file', async () => {
      render(
        <ConfigTemplateEditor
          open={true}
          onOpenChange={mockOnOpenChange}
          configType={ConfigTypes.CLAUDE_MD}
          onSave={mockOnSave}
        />
      )

      // First set a name
      const nameInput = screen.getByLabelText(/Name/i)
      fireEvent.change(nameInput, { target: { value: 'Existing Name' } })

      // Then upload a file
      const fileInput = screen.getByTestId('file-input')
      const file = new File(['# Content'], 'new-file.md', { type: 'text/markdown' })

      fireEvent.change(fileInput, { target: { files: [file] } })

      await waitFor(() => {
        // Name should remain unchanged
        expect(screen.getByLabelText(/Name/i)).toHaveValue('Existing Name')
        // Content should be updated
        expect(screen.getByTestId('content-editor')).toHaveValue('# Content')
      })
    })

    it('should show error for invalid JSON content in uploaded MCP file', async () => {
      render(
        <ConfigTemplateEditor
          open={true}
          onOpenChange={mockOnOpenChange}
          configType={ConfigTypes.MCP}
          onSave={mockOnSave}
        />
      )

      const fileInput = screen.getByTestId('file-input')
      // Valid JSON but missing required fields
      const file = new File(['{"invalid": true}'], 'bad-mcp.json', { type: 'application/json' })

      fireEvent.change(fileInput, { target: { files: [file] } })

      await waitFor(() => {
        expect(screen.getByTestId('file-error')).toHaveTextContent(/must have a "command" field/i)
      })
    })
  })

  describe('Loading State', () => {
    it('should show loading spinner when saving', async () => {
      // Make onSave take some time
      mockOnSave.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)))

      render(
        <ConfigTemplateEditor
          open={true}
          onOpenChange={mockOnOpenChange}
          configType={ConfigTypes.CLAUDE_MD}
          onSave={mockOnSave}
        />
      )

      // Fill form
      const nameInput = screen.getByLabelText(/Name/i)
      fireEvent.change(nameInput, { target: { value: 'Test' } })

      const contentEditor = screen.getByTestId('content-editor')
      fireEvent.change(contentEditor, { target: { value: '# Content' } })

      // Click save
      const saveButton = screen.getByTestId('save-button')
      fireEvent.click(saveButton)

      // Button should be disabled during save
      await waitFor(() => {
        expect(saveButton).toBeDisabled()
      })
    })

    it('should close dialog after successful save', async () => {
      render(
        <ConfigTemplateEditor
          open={true}
          onOpenChange={mockOnOpenChange}
          configType={ConfigTypes.CLAUDE_MD}
          onSave={mockOnSave}
        />
      )

      // Fill form
      const nameInput = screen.getByLabelText(/Name/i)
      fireEvent.change(nameInput, { target: { value: 'Test' } })

      const contentEditor = screen.getByTestId('content-editor')
      fireEvent.change(contentEditor, { target: { value: '# Content' } })

      // Save
      const saveButton = screen.getByTestId('save-button')
      fireEvent.click(saveButton)

      await waitFor(() => {
        expect(mockOnOpenChange).toHaveBeenCalledWith(false)
      })
    })
  })

  describe('validateFileType helper', () => {
    it('should return true for .md file with CLAUDE_MD type', () => {
      const file = new File([''], 'test.md')
      expect(validateFileType(file, ConfigTypes.CLAUDE_MD)).toBe(true)
    })

    it('should return true for .md file with SKILL type', () => {
      const file = new File([''], 'test.md')
      expect(validateFileType(file, ConfigTypes.SKILL)).toBe(true)
    })

    it('should return true for .md file with COMMAND type', () => {
      const file = new File([''], 'test.md')
      expect(validateFileType(file, ConfigTypes.COMMAND)).toBe(true)
    })

    it('should return true for .json file with MCP type', () => {
      const file = new File([''], 'test.json')
      expect(validateFileType(file, ConfigTypes.MCP)).toBe(true)
    })

    it('should return false for .json file with CLAUDE_MD type', () => {
      const file = new File([''], 'test.json')
      expect(validateFileType(file, ConfigTypes.CLAUDE_MD)).toBe(false)
    })

    it('should return false for .md file with MCP type', () => {
      const file = new File([''], 'test.md')
      expect(validateFileType(file, ConfigTypes.MCP)).toBe(false)
    })

    it('should handle uppercase extensions', () => {
      const file = new File([''], 'TEST.MD')
      expect(validateFileType(file, ConfigTypes.CLAUDE_MD)).toBe(true)
    })

    it('should handle mixed case extensions', () => {
      const file = new File([''], 'test.Json')
      expect(validateFileType(file, ConfigTypes.MCP)).toBe(true)
    })
  })
})
