import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ConfigPreview, {
  truncateByLines,
  formatJsonContent,
  getSyntaxType,
} from '@/components/ConfigPreview'
import { ConfigTypes } from '@/types/claudeConfig'

// Sample test content
const shortMarkdownContent = '# Title\n\nShort content.'
const longMarkdownContent = `# Title

Line 1
Line 2
Line 3
Line 4
Line 5
Line 6
Line 7
Line 8
Line 9
Line 10`

const shortJsonContent = '{"command": "npx", "args": ["-y", "@test/server"]}'
const longJsonContent = `{
  "command": "npx",
  "args": ["-y", "@test/server"],
  "env": {
    "NODE_ENV": "production",
    "DEBUG": "true",
    "LOG_LEVEL": "info"
  },
  "transport": "stdio",
  "url": "http://localhost:3000"
}`

describe('ConfigPreview', () => {
  describe('Content Rendering', () => {
    describe('Markdown Content', () => {
      it('should render markdown content for CLAUDE_MD type', () => {
        render(
          <ConfigPreview
            content={shortMarkdownContent}
            configType={ConfigTypes.CLAUDE_MD}
            trigger="click"
          />
        )

        expect(screen.getByTestId('preview-content')).toHaveTextContent('# Title')
        expect(screen.getByTestId('preview-content')).toHaveTextContent('Short content.')
      })

      it('should render markdown content for SKILL type', () => {
        render(
          <ConfigPreview
            content={shortMarkdownContent}
            configType={ConfigTypes.SKILL}
            trigger="click"
          />
        )

        expect(screen.getByTestId('preview-content')).toHaveTextContent('# Title')
        expect(screen.getByTestId('syntax-type')).toHaveTextContent('Markdown')
      })

      it('should render markdown content for COMMAND type', () => {
        render(
          <ConfigPreview
            content={shortMarkdownContent}
            configType={ConfigTypes.COMMAND}
            trigger="click"
          />
        )

        expect(screen.getByTestId('preview-content')).toHaveTextContent('# Title')
        expect(screen.getByTestId('syntax-type')).toHaveTextContent('Markdown')
      })

      it('should set data-syntax attribute to markdown for markdown types', () => {
        render(
          <ConfigPreview
            content={shortMarkdownContent}
            configType={ConfigTypes.CLAUDE_MD}
            trigger="click"
          />
        )

        expect(screen.getByTestId('preview-content')).toHaveAttribute('data-syntax', 'markdown')
      })
    })

    describe('JSON Content', () => {
      it('should render JSON content for MCP type', () => {
        render(
          <ConfigPreview
            content={shortJsonContent}
            configType={ConfigTypes.MCP}
            trigger="click"
          />
        )

        expect(screen.getByTestId('preview-content')).toHaveTextContent('command')
        expect(screen.getByTestId('preview-content')).toHaveTextContent('npx')
        expect(screen.getByTestId('syntax-type')).toHaveTextContent('JSON')
      })

      it('should format JSON content with proper indentation', () => {
        render(
          <ConfigPreview
            content={shortJsonContent}
            configType={ConfigTypes.MCP}
            trigger="click"
          />
        )

        const content = screen.getByTestId('preview-content').textContent
        // Formatted JSON should have newlines
        expect(content).toContain('"command"')
        expect(content).toContain('"args"')
      })

      it('should set data-syntax attribute to json for MCP type', () => {
        render(
          <ConfigPreview
            content={shortJsonContent}
            configType={ConfigTypes.MCP}
            trigger="click"
          />
        )

        expect(screen.getByTestId('preview-content')).toHaveAttribute('data-syntax', 'json')
      })

      it('should handle invalid JSON gracefully', () => {
        const invalidJson = '{ invalid json }'
        render(
          <ConfigPreview
            content={invalidJson}
            configType={ConfigTypes.MCP}
            trigger="click"
          />
        )

        // Should display the original content when JSON is invalid
        expect(screen.getByTestId('preview-content')).toHaveTextContent('{ invalid json }')
      })
    })
  })

  describe('Truncation Logic', () => {
    it('should display small content fully without truncation', () => {
      render(
        <ConfigPreview
          content={shortMarkdownContent}
          configType={ConfigTypes.CLAUDE_MD}
          trigger="click"
          maxLines={5}
        />
      )

      expect(screen.getByTestId('preview-content')).toHaveTextContent('Short content.')
      expect(screen.queryByTestId('toggle-expand-button')).not.toBeInTheDocument()
    })

    it('should truncate large content', () => {
      render(
        <ConfigPreview
          content={longMarkdownContent}
          configType={ConfigTypes.CLAUDE_MD}
          trigger="click"
          maxLines={5}
        />
      )

      // Should show truncation indicator
      expect(screen.getByTestId('preview-content')).toHaveTextContent('...')
      // Should show toggle button
      expect(screen.getByTestId('toggle-expand-button')).toBeInTheDocument()
      expect(screen.getByTestId('toggle-expand-button')).toHaveTextContent('Show more')
    })

    it('should respect custom maxLines prop', () => {
      render(
        <ConfigPreview
          content={longMarkdownContent}
          configType={ConfigTypes.CLAUDE_MD}
          trigger="click"
          maxLines={3}
        />
      )

      // With maxLines=3, content should be truncated
      expect(screen.getByTestId('toggle-expand-button')).toBeInTheDocument()
    })

    it('should not truncate when content has exactly maxLines', () => {
      const exactContent = 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5'
      render(
        <ConfigPreview
          content={exactContent}
          configType={ConfigTypes.CLAUDE_MD}
          trigger="click"
          maxLines={5}
        />
      )

      expect(screen.queryByTestId('toggle-expand-button')).not.toBeInTheDocument()
    })

    it('should use default maxLines of 5 when not specified', () => {
      const sixLineContent = 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5\nLine 6'
      render(
        <ConfigPreview
          content={sixLineContent}
          configType={ConfigTypes.CLAUDE_MD}
          trigger="click"
        />
      )

      // Should be truncated with default maxLines=5
      expect(screen.getByTestId('toggle-expand-button')).toBeInTheDocument()
    })
  })

  describe('Show More/Less Functionality', () => {
    it('should expand content when "Show more" is clicked', async () => {
      render(
        <ConfigPreview
          content={longMarkdownContent}
          configType={ConfigTypes.CLAUDE_MD}
          trigger="click"
          maxLines={5}
        />
      )

      // Initially truncated
      expect(screen.getByTestId('toggle-expand-button')).toHaveTextContent('Show more')

      // Click to expand
      fireEvent.click(screen.getByTestId('toggle-expand-button'))

      await waitFor(() => {
        expect(screen.getByTestId('toggle-expand-button')).toHaveTextContent('Show less')
      })

      // Content should now include later lines
      expect(screen.getByTestId('preview-content')).toHaveTextContent('Line 10')
    })

    it('should collapse content when "Show less" is clicked', async () => {
      render(
        <ConfigPreview
          content={longMarkdownContent}
          configType={ConfigTypes.CLAUDE_MD}
          trigger="click"
          maxLines={5}
        />
      )

      // Expand first
      fireEvent.click(screen.getByTestId('toggle-expand-button'))

      await waitFor(() => {
        expect(screen.getByTestId('toggle-expand-button')).toHaveTextContent('Show less')
      })

      // Click to collapse
      fireEvent.click(screen.getByTestId('toggle-expand-button'))

      await waitFor(() => {
        expect(screen.getByTestId('toggle-expand-button')).toHaveTextContent('Show more')
      })

      // Content should be truncated again
      expect(screen.getByTestId('preview-content')).toHaveTextContent('...')
    })

    it('should toggle between expanded and collapsed states', async () => {
      render(
        <ConfigPreview
          content={longMarkdownContent}
          configType={ConfigTypes.CLAUDE_MD}
          trigger="click"
          maxLines={5}
        />
      )

      const toggleButton = screen.getByTestId('toggle-expand-button')

      // Initial state: collapsed
      expect(toggleButton).toHaveTextContent('Show more')

      // First click: expand
      fireEvent.click(toggleButton)
      await waitFor(() => {
        expect(toggleButton).toHaveTextContent('Show less')
      })

      // Second click: collapse
      fireEvent.click(toggleButton)
      await waitFor(() => {
        expect(toggleButton).toHaveTextContent('Show more')
      })

      // Third click: expand again
      fireEvent.click(toggleButton)
      await waitFor(() => {
        expect(toggleButton).toHaveTextContent('Show less')
      })
    })
  })

  describe('Trigger Methods', () => {
    describe('Click Trigger (Inline Mode)', () => {
      it('should render inline preview with click trigger', () => {
        render(
          <ConfigPreview
            content={shortMarkdownContent}
            configType={ConfigTypes.CLAUDE_MD}
            trigger="click"
          />
        )

        expect(screen.getByTestId('config-preview-inline')).toBeInTheDocument()
        expect(screen.queryByTestId('config-preview-trigger')).not.toBeInTheDocument()
      })

      it('should display content directly in inline mode', () => {
        render(
          <ConfigPreview
            content={shortMarkdownContent}
            configType={ConfigTypes.CLAUDE_MD}
            trigger="click"
          />
        )

        expect(screen.getByTestId('preview-content')).toBeVisible()
      })
    })

    describe('Hover Trigger (Popover Mode)', () => {
      it('should render popover trigger with hover trigger', () => {
        render(
          <ConfigPreview
            content={shortMarkdownContent}
            configType={ConfigTypes.CLAUDE_MD}
            trigger="hover"
          >
            <span>Hover me</span>
          </ConfigPreview>
        )

        expect(screen.getByTestId('config-preview-trigger')).toBeInTheDocument()
        expect(screen.getByText('Hover me')).toBeInTheDocument()
      })

      it('should show popover on hover', async () => {
        render(
          <ConfigPreview
            content={shortMarkdownContent}
            configType={ConfigTypes.CLAUDE_MD}
            trigger="hover"
          >
            <span>Hover me</span>
          </ConfigPreview>
        )

        const trigger = screen.getByTestId('config-preview-trigger')
        
        // Hover over trigger
        fireEvent.mouseEnter(trigger)

        await waitFor(() => {
          expect(screen.getByTestId('config-preview-popover')).toBeInTheDocument()
        })
      })

      it('should hide popover on mouse leave', async () => {
        render(
          <ConfigPreview
            content={shortMarkdownContent}
            configType={ConfigTypes.CLAUDE_MD}
            trigger="hover"
          >
            <span>Hover me</span>
          </ConfigPreview>
        )

        const trigger = screen.getByTestId('config-preview-trigger')
        
        // Hover over trigger
        fireEvent.mouseEnter(trigger)

        await waitFor(() => {
          expect(screen.getByTestId('config-preview-popover')).toBeInTheDocument()
        })

        // Leave the popover
        const popover = screen.getByTestId('config-preview-popover')
        fireEvent.mouseLeave(popover)

        await waitFor(() => {
          expect(screen.queryByTestId('config-preview-popover')).not.toBeInTheDocument()
        })
      })

      it('should use hover as default trigger', () => {
        render(
          <ConfigPreview
            content={shortMarkdownContent}
            configType={ConfigTypes.CLAUDE_MD}
          >
            <span>Hover me</span>
          </ConfigPreview>
        )

        expect(screen.getByTestId('config-preview-trigger')).toBeInTheDocument()
      })

      it('should render children as trigger element', () => {
        render(
          <ConfigPreview
            content={shortMarkdownContent}
            configType={ConfigTypes.CLAUDE_MD}
            trigger="hover"
          >
            <button>Custom Trigger</button>
          </ConfigPreview>
        )

        expect(screen.getByRole('button', { name: 'Custom Trigger' })).toBeInTheDocument()
      })
    })
  })

  describe('Custom className', () => {
    it('should apply custom className to inline preview', () => {
      render(
        <ConfigPreview
          content={shortMarkdownContent}
          configType={ConfigTypes.CLAUDE_MD}
          trigger="click"
          className="custom-class"
        />
      )

      expect(screen.getByTestId('config-preview-inline')).toHaveClass('custom-class')
    })

    it('should apply custom className to popover trigger', () => {
      render(
        <ConfigPreview
          content={shortMarkdownContent}
          configType={ConfigTypes.CLAUDE_MD}
          trigger="hover"
          className="custom-class"
        >
          <span>Trigger</span>
        </ConfigPreview>
      )

      expect(screen.getByTestId('config-preview-trigger')).toHaveClass('custom-class')
    })
  })

  describe('Helper Functions', () => {
    describe('truncateByLines', () => {
      it('should not truncate content with fewer lines than maxLines', () => {
        const content = 'Line 1\nLine 2\nLine 3'
        const result = truncateByLines(content, 5)
        
        expect(result.truncated).toBe(content)
        expect(result.isTruncated).toBe(false)
      })

      it('should truncate content with more lines than maxLines', () => {
        const content = 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5\nLine 6'
        const result = truncateByLines(content, 3)
        
        expect(result.truncated).toBe('Line 1\nLine 2\nLine 3')
        expect(result.isTruncated).toBe(true)
      })

      it('should not truncate content with exactly maxLines', () => {
        const content = 'Line 1\nLine 2\nLine 3'
        const result = truncateByLines(content, 3)
        
        expect(result.truncated).toBe(content)
        expect(result.isTruncated).toBe(false)
      })

      it('should handle single line content', () => {
        const content = 'Single line'
        const result = truncateByLines(content, 5)
        
        expect(result.truncated).toBe(content)
        expect(result.isTruncated).toBe(false)
      })

      it('should handle empty content', () => {
        const content = ''
        const result = truncateByLines(content, 5)
        
        expect(result.truncated).toBe('')
        expect(result.isTruncated).toBe(false)
      })
    })

    describe('formatJsonContent', () => {
      it('should format valid JSON with indentation', () => {
        const json = '{"key":"value","nested":{"a":1}}'
        const result = formatJsonContent(json)
        
        expect(result).toContain('\n')
        expect(result).toContain('  ')
      })

      it('should return original content for invalid JSON', () => {
        const invalidJson = '{ invalid json }'
        const result = formatJsonContent(invalidJson)
        
        expect(result).toBe(invalidJson)
      })

      it('should handle empty JSON object', () => {
        const json = '{}'
        const result = formatJsonContent(json)
        
        expect(result).toBe('{}')
      })

      it('should handle JSON array', () => {
        const json = '[1, 2, 3]'
        const result = formatJsonContent(json)
        
        expect(result).toContain('1')
        expect(result).toContain('2')
        expect(result).toContain('3')
      })
    })

    describe('getSyntaxType', () => {
      it('should return json for MCP type', () => {
        expect(getSyntaxType(ConfigTypes.MCP)).toBe('json')
      })

      it('should return markdown for CLAUDE_MD type', () => {
        expect(getSyntaxType(ConfigTypes.CLAUDE_MD)).toBe('markdown')
      })

      it('should return markdown for SKILL type', () => {
        expect(getSyntaxType(ConfigTypes.SKILL)).toBe('markdown')
      })

      it('should return markdown for COMMAND type', () => {
        expect(getSyntaxType(ConfigTypes.COMMAND)).toBe('markdown')
      })
    })
  })
})
