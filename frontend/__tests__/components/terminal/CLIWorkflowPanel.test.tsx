import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CLIWorkflowPanel } from '@/components/terminal/CLIWorkflowPanel'

describe('CLIWorkflowPanel', () => {
  const onClose = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns null when no content to display', () => {
    const { container } = render(
      <CLIWorkflowPanel
        geminiOutput={null}
        codexOutput={null}
        isLoading={false}
        onClose={onClose}
      />
    )
    expect(container.innerHTML).toBe('')
  })

  it('shows loading spinner when isLoading is true', () => {
    render(
      <CLIWorkflowPanel
        geminiOutput={null}
        codexOutput={null}
        isLoading={true}
        onClose={onClose}
      />
    )
    expect(screen.getByText(/Processing workflow/)).toBeInTheDocument()
  })

  it('displays gemini output in expandable section', () => {
    render(
      <CLIWorkflowPanel
        geminiOutput="Gemini analysis result"
        codexOutput={null}
        isLoading={false}
        onClose={onClose}
      />
    )
    expect(screen.getByText('Analysis Results')).toBeInTheDocument()
    expect(screen.getByText('Gemini analysis result')).toBeInTheDocument()
  })

  it('displays codex output in expandable section', () => {
    render(
      <CLIWorkflowPanel
        geminiOutput={null}
        codexOutput="Codex modification result"
        isLoading={false}
        onClose={onClose}
      />
    )
    expect(screen.getByText('Modifications')).toBeInTheDocument()
    expect(screen.getByText('Codex modification result')).toBeInTheDocument()
  })

  it('displays both outputs when both provided', () => {
    render(
      <CLIWorkflowPanel
        geminiOutput="Gemini output"
        codexOutput="Codex output"
        isLoading={false}
        onClose={onClose}
      />
    )
    expect(screen.getByText('Analysis Results')).toBeInTheDocument()
    expect(screen.getByText('Modifications')).toBeInTheDocument()
  })

  it('calls onClose when close button clicked', () => {
    render(
      <CLIWorkflowPanel
        geminiOutput="Some output"
        codexOutput={null}
        isLoading={false}
        onClose={onClose}
      />
    )
    fireEvent.click(screen.getByText('Close'))
    expect(onClose).toHaveBeenCalled()
  })

  it('collapses gemini section when header clicked', () => {
    render(
      <CLIWorkflowPanel
        geminiOutput="Gemini analysis result"
        codexOutput={null}
        isLoading={false}
        onClose={onClose}
      />
    )
    // Initially expanded - content visible
    expect(screen.getByText('Gemini analysis result')).toBeInTheDocument()

    // Click to collapse
    fireEvent.click(screen.getByText('Analysis Results'))

    // Content should be hidden (not in DOM)
    expect(screen.queryByText('Gemini analysis result')).not.toBeInTheDocument()
  })
})
