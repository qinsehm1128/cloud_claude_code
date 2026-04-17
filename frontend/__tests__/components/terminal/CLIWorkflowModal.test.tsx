import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CLIWorkflowModal } from '@/components/terminal/CLIWorkflowModal'

describe('CLIWorkflowModal', () => {
  const onClose = vi.fn()
  const onSubmit = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders analyze mode form correctly', () => {
    render(
      <CLIWorkflowModal
        isOpen={true}
        onClose={onClose}
        onSubmit={onSubmit}
        workflowType="analyze"
        defaultWorkdir="/app"
      />
    )
    expect(screen.getByText('Analyze Code')).toBeInTheDocument()
    expect(screen.getByText('Analysis Prompt')).toBeInTheDocument()
    expect(screen.getByText('Working Directory')).toBeInTheDocument()
    // Modification Prompt should NOT be present in analyze mode
    expect(screen.queryByText('Modification Prompt')).not.toBeInTheDocument()
  })

  it('renders sequential mode form with modification prompt', () => {
    render(
      <CLIWorkflowModal
        isOpen={true}
        onClose={onClose}
        onSubmit={onSubmit}
        workflowType="sequential"
        defaultWorkdir="/app"
      />
    )
    expect(screen.getByText('Auto-fix Issues')).toBeInTheDocument()
    expect(screen.getByText('Analysis Prompt')).toBeInTheDocument()
    expect(screen.getByText('Modification Prompt')).toBeInTheDocument()
    expect(screen.getByText('Working Directory')).toBeInTheDocument()
  })

  it('sets default workdir value', () => {
    render(
      <CLIWorkflowModal
        isOpen={true}
        onClose={onClose}
        onSubmit={onSubmit}
        workflowType="analyze"
        defaultWorkdir="/workspace"
      />
    )
    const workdirInput = screen.getByDisplayValue('/workspace')
    expect(workdirInput).toBeInTheDocument()
  })

  it('calls onClose when cancel button clicked', () => {
    render(
      <CLIWorkflowModal
        isOpen={true}
        onClose={onClose}
        onSubmit={onSubmit}
        workflowType="analyze"
        defaultWorkdir="/app"
      />
    )
    fireEvent.click(screen.getByText('Cancel'))
    expect(onClose).toHaveBeenCalled()
  })

  it('shows validation error for short analysis prompt', () => {
    render(
      <CLIWorkflowModal
        isOpen={true}
        onClose={onClose}
        onSubmit={onSubmit}
        workflowType="analyze"
        defaultWorkdir="/app"
      />
    )
    // Type a short prompt
    const textarea = screen.getByPlaceholderText(/Describe what to analyze/)
    fireEvent.change(textarea, { target: { value: 'short' } })

    // Submit
    fireEvent.click(screen.getByText('Analyze'))

    // Should show validation error
    expect(screen.getByText(/at least 10 characters/)).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('calls onSubmit with form data on valid submission in analyze mode', () => {
    render(
      <CLIWorkflowModal
        isOpen={true}
        onClose={onClose}
        onSubmit={onSubmit}
        workflowType="analyze"
        defaultWorkdir="/app"
      />
    )
    const textarea = screen.getByPlaceholderText(/Describe what to analyze/)
    fireEvent.change(textarea, { target: { value: 'Analyze the authentication module for vulnerabilities' } })

    fireEvent.click(screen.getByText('Analyze'))

    expect(onSubmit).toHaveBeenCalledWith({
      analysisPrompt: 'Analyze the authentication module for vulnerabilities',
      modificationPrompt: undefined,
      workdir: '/app',
    })
  })

  it('does not render when isOpen is false', () => {
    const { container } = render(
      <CLIWorkflowModal
        isOpen={false}
        onClose={onClose}
        onSubmit={onSubmit}
        workflowType="analyze"
        defaultWorkdir="/app"
      />
    )
    expect(screen.queryByText('Analyze Code')).not.toBeInTheDocument()
    // Dialog should not be visible
    expect(container.querySelector('[role="dialog"]')).toBeNull()
  })
})
