import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AuxiliaryKeyboard } from '@/components/terminal/AuxiliaryKeyboard'

describe('AuxiliaryKeyboard', () => {
  const onCommand = vi.fn()
  const onScroll = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders all 5 preset command buttons plus 2 scroll buttons', () => {
    render(<AuxiliaryKeyboard onCommand={onCommand} onScroll={onScroll} />)
    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(7)
  })

  it('renders preset command labels', () => {
    render(<AuxiliaryKeyboard onCommand={onCommand} onScroll={onScroll} />)
    expect(screen.getByText('cd ..')).toBeInTheDocument()
    expect(screen.getByText('ls -la')).toBeInTheDocument()
    expect(screen.getByText('pwd')).toBeInTheDocument()
    expect(screen.getByText('clear')).toBeInTheDocument()
    expect(screen.getByText('exit')).toBeInTheDocument()
  })

  it('calls onCommand with correct command when preset button clicked', () => {
    render(<AuxiliaryKeyboard onCommand={onCommand} onScroll={onScroll} />)
    fireEvent.click(screen.getByText('ls -la'))
    expect(onCommand).toHaveBeenCalledWith('ls -la\n')
  })

  it('calls onScroll with "up" when scroll up button clicked', () => {
    render(<AuxiliaryKeyboard onCommand={onCommand} onScroll={onScroll} />)
    fireEvent.click(screen.getByLabelText('Scroll up'))
    expect(onScroll).toHaveBeenCalledWith('up')
  })

  it('calls onScroll with "down" when scroll down button clicked', () => {
    render(<AuxiliaryKeyboard onCommand={onCommand} onScroll={onScroll} />)
    fireEvent.click(screen.getByLabelText('Scroll down'))
    expect(onScroll).toHaveBeenCalledWith('down')
  })

  it('renders scroll buttons with Up/Down labels', () => {
    render(<AuxiliaryKeyboard onCommand={onCommand} onScroll={onScroll} />)
    expect(screen.getByText('Up')).toBeInTheDocument()
    expect(screen.getByText('Down')).toBeInTheDocument()
  })

  it('buttons have minimum touch target size', () => {
    render(<AuxiliaryKeyboard onCommand={onCommand} onScroll={onScroll} />)
    const buttons = screen.getAllByRole('button')
    buttons.forEach((button) => {
      expect(button.className).toContain('min-h-[44px]')
    })
  })

  it('accepts custom preset commands', () => {
    const customPresets = [
      { id: 'custom', label: 'git status', command: 'git status\n', icon: () => null },
    ]
    render(
      <AuxiliaryKeyboard
        onCommand={onCommand}
        onScroll={onScroll}
        presetCommands={customPresets as never}
      />
    )
    expect(screen.getByText('git status')).toBeInTheDocument()
    // 1 custom preset + 2 scroll buttons
    expect(screen.getAllByRole('button')).toHaveLength(3)
  })
})
