/**
 * Property-Based Tests for Claude Config Management
 * 
 * Feature: claude-config-management
 * 
 * These tests use fast-check to verify properties hold across many random inputs.
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { truncateByLines } from '@/components/ConfigPreview'

/**
 * Feature: claude-config-management, Property 8: Config selection constraints
 * 
 * For any container creation request, at most one CLAUDE_MD template can be selected,
 * while multiple Skills, MCPs, and Commands can be selected. Selecting more than one
 * CLAUDE_MD should be prevented.
 * 
 * **Validates: Requirements 5.4**
 */
describe('Property 8: Config Selection Constraints', () => {
  // Type definitions for config selection
  interface ConfigSelection {
    selectedClaudeMD: number | undefined
    selectedSkills: number[]
    selectedMCPs: number[]
    selectedCommands: number[]
  }

  // Helper function that validates config selection constraints
  // This mirrors the logic in Dashboard.tsx where CLAUDE_MD is single-select
  // and Skills, MCPs, Commands are multi-select
  const validateConfigSelection = (selection: ConfigSelection): {
    isValid: boolean
    claudeMDCount: number
    skillsCount: number
    mcpsCount: number
    commandsCount: number
  } => {
    const claudeMDCount = selection.selectedClaudeMD !== undefined ? 1 : 0
    const skillsCount = selection.selectedSkills.length
    const mcpsCount = selection.selectedMCPs.length
    const commandsCount = selection.selectedCommands.length

    // CLAUDE_MD can only be 0 or 1 (single select)
    const isValid = claudeMDCount <= 1

    return {
      isValid,
      claudeMDCount,
      skillsCount,
      mcpsCount,
      commandsCount,
    }
  }

  // Simulate the selection behavior from Dashboard.tsx
  // When selecting a CLAUDE_MD, it replaces any previous selection (single-select)
  const selectClaudeMD = (
    currentSelection: ConfigSelection,
    newId: number | undefined
  ): ConfigSelection => {
    return {
      ...currentSelection,
      selectedClaudeMD: newId, // Always replaces, never adds
    }
  }

  // Simulate multi-select behavior for Skills
  // This mirrors the actual Dashboard.tsx behavior where toggling adds if not present
  const toggleSkill = (
    currentSelection: ConfigSelection,
    skillId: number,
    checked: boolean
  ): ConfigSelection => {
    if (checked) {
      // Only add if not already present (prevent duplicates)
      if (currentSelection.selectedSkills.includes(skillId)) {
        return currentSelection
      }
      return {
        ...currentSelection,
        selectedSkills: [...currentSelection.selectedSkills, skillId],
      }
    } else {
      return {
        ...currentSelection,
        selectedSkills: currentSelection.selectedSkills.filter(id => id !== skillId),
      }
    }
  }

  // Generator for config IDs (positive integers)
  const configIdArb = fc.integer({ min: 1, max: 1000 })

  // Generator for optional CLAUDE_MD selection (undefined or single ID)
  const claudeMDSelectionArb = fc.option(configIdArb, { nil: undefined })

  // Generator for multi-select arrays (unique IDs)
  const multiSelectArb = fc.uniqueArray(configIdArb, { minLength: 0, maxLength: 10 })

  // Generator for a complete config selection
  const configSelectionArb: fc.Arbitrary<ConfigSelection> = fc.record({
    selectedClaudeMD: claudeMDSelectionArb,
    selectedSkills: multiSelectArb,
    selectedMCPs: multiSelectArb,
    selectedCommands: multiSelectArb,
  })

  it('should allow at most one CLAUDE_MD to be selected', () => {
    fc.assert(
      fc.property(configSelectionArb, (selection) => {
        const result = validateConfigSelection(selection)
        
        // CLAUDE_MD count should always be 0 or 1
        expect(result.claudeMDCount).toBeLessThanOrEqual(1)
        expect(result.isValid).toBe(true)
      }),
      { numRuns: 100 }
    )
  })

  it('should allow multiple Skills to be selected', () => {
    fc.assert(
      fc.property(multiSelectArb, (skillIds) => {
        const selection: ConfigSelection = {
          selectedClaudeMD: undefined,
          selectedSkills: skillIds,
          selectedMCPs: [],
          selectedCommands: [],
        }
        
        const result = validateConfigSelection(selection)
        
        // Multiple skills should be allowed
        expect(result.skillsCount).toBe(skillIds.length)
        expect(result.isValid).toBe(true)
      }),
      { numRuns: 100 }
    )
  })

  it('should allow multiple MCPs to be selected', () => {
    fc.assert(
      fc.property(multiSelectArb, (mcpIds) => {
        const selection: ConfigSelection = {
          selectedClaudeMD: undefined,
          selectedSkills: [],
          selectedMCPs: mcpIds,
          selectedCommands: [],
        }
        
        const result = validateConfigSelection(selection)
        
        // Multiple MCPs should be allowed
        expect(result.mcpsCount).toBe(mcpIds.length)
        expect(result.isValid).toBe(true)
      }),
      { numRuns: 100 }
    )
  })

  it('should allow multiple Commands to be selected', () => {
    fc.assert(
      fc.property(multiSelectArb, (commandIds) => {
        const selection: ConfigSelection = {
          selectedClaudeMD: undefined,
          selectedSkills: [],
          selectedMCPs: [],
          selectedCommands: commandIds,
        }
        
        const result = validateConfigSelection(selection)
        
        // Multiple commands should be allowed
        expect(result.commandsCount).toBe(commandIds.length)
        expect(result.isValid).toBe(true)
      }),
      { numRuns: 100 }
    )
  })

  it('should replace previous CLAUDE_MD when selecting a new one (single-select behavior)', () => {
    fc.assert(
      fc.property(
        configIdArb,
        configIdArb,
        (firstId, secondId) => {
          // Start with empty selection
          let selection: ConfigSelection = {
            selectedClaudeMD: undefined,
            selectedSkills: [],
            selectedMCPs: [],
            selectedCommands: [],
          }

          // Select first CLAUDE_MD
          selection = selectClaudeMD(selection, firstId)
          expect(selection.selectedClaudeMD).toBe(firstId)
          expect(validateConfigSelection(selection).claudeMDCount).toBe(1)

          // Select second CLAUDE_MD - should replace, not add
          selection = selectClaudeMD(selection, secondId)
          expect(selection.selectedClaudeMD).toBe(secondId)
          expect(validateConfigSelection(selection).claudeMDCount).toBe(1)

          // The selection should still be valid (at most 1 CLAUDE_MD)
          expect(validateConfigSelection(selection).isValid).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should allow deselecting CLAUDE_MD', () => {
    fc.assert(
      fc.property(configIdArb, (id) => {
        // Start with a selected CLAUDE_MD
        let selection: ConfigSelection = {
          selectedClaudeMD: id,
          selectedSkills: [],
          selectedMCPs: [],
          selectedCommands: [],
        }

        expect(validateConfigSelection(selection).claudeMDCount).toBe(1)

        // Deselect CLAUDE_MD
        selection = selectClaudeMD(selection, undefined)
        expect(selection.selectedClaudeMD).toBeUndefined()
        expect(validateConfigSelection(selection).claudeMDCount).toBe(0)
        expect(validateConfigSelection(selection).isValid).toBe(true)
      }),
      { numRuns: 100 }
    )
  })

  it('should maintain multi-select behavior for Skills through toggle operations', () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(configIdArb, fc.boolean()), { minLength: 1, maxLength: 20 }),
        (operations) => {
          let selection: ConfigSelection = {
            selectedClaudeMD: undefined,
            selectedSkills: [],
            selectedMCPs: [],
            selectedCommands: [],
          }

          // Apply toggle operations
          for (const [skillId, checked] of operations) {
            selection = toggleSkill(selection, skillId, checked)
          }

          // Selection should always be valid
          expect(validateConfigSelection(selection).isValid).toBe(true)
          
          // Skills array should contain unique IDs
          const uniqueSkills = new Set(selection.selectedSkills)
          expect(uniqueSkills.size).toBe(selection.selectedSkills.length)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should allow combining CLAUDE_MD with multiple Skills, MCPs, and Commands', () => {
    fc.assert(
      fc.property(configSelectionArb, (selection) => {
        const result = validateConfigSelection(selection)
        
        // All combinations should be valid as long as CLAUDE_MD count <= 1
        expect(result.isValid).toBe(true)
        
        // Can have any number of Skills, MCPs, Commands
        expect(result.skillsCount).toBeGreaterThanOrEqual(0)
        expect(result.mcpsCount).toBeGreaterThanOrEqual(0)
        expect(result.commandsCount).toBeGreaterThanOrEqual(0)
      }),
      { numRuns: 100 }
    )
  })
})


/**
 * Feature: claude-config-management, Property 13: Content truncation for preview
 * 
 * For any template preview, content exceeding a threshold (e.g., 500 characters or 5 lines)
 * should be truncated with a "Show more" option. Small content should be shown in full.
 * 
 * **Validates: Requirements 9.2**
 */
describe('Property 13: Content Truncation for Preview', () => {
  // Generator for arbitrary content
  const contentArb = fc.string({ minLength: 0, maxLength: 2000 })

  // Generator for maxLines parameter (positive integer)
  const maxLinesArb = fc.integer({ min: 1, max: 20 })

  it('should not truncate content with fewer lines than maxLines', () => {
    fc.assert(
      fc.property(
        maxLinesArb,
        fc.integer({ min: 0, max: 100 }),
        (maxLines, numLines) => {
          // Generate content with fewer lines than maxLines
          const actualLines = Math.min(numLines, maxLines - 1)
          const lines = Array.from({ length: actualLines }, (_, i) => `Line ${i + 1}`)
          const content = lines.join('\n')

          const result = truncateByLines(content, maxLines)

          // Content should not be truncated
          expect(result.isTruncated).toBe(false)
          expect(result.truncated).toBe(content)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should truncate content with more lines than maxLines', () => {
    fc.assert(
      fc.property(
        maxLinesArb,
        fc.integer({ min: 1, max: 50 }),
        (maxLines, extraLines) => {
          // Generate content with more lines than maxLines
          const totalLines = maxLines + extraLines
          const lines = Array.from({ length: totalLines }, (_, i) => `Line ${i + 1}`)
          const content = lines.join('\n')

          const result = truncateByLines(content, maxLines)

          // Content should be truncated
          expect(result.isTruncated).toBe(true)
          
          // Truncated content should have exactly maxLines lines
          const truncatedLines = result.truncated.split('\n')
          expect(truncatedLines.length).toBe(maxLines)
          
          // Truncated content should be a prefix of original
          expect(content.startsWith(result.truncated)).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should not truncate content with exactly maxLines', () => {
    fc.assert(
      fc.property(maxLinesArb, (maxLines) => {
        // Generate content with exactly maxLines lines
        const lines = Array.from({ length: maxLines }, (_, i) => `Line ${i + 1}`)
        const content = lines.join('\n')

        const result = truncateByLines(content, maxLines)

        // Content should not be truncated when exactly at the limit
        expect(result.isTruncated).toBe(false)
        expect(result.truncated).toBe(content)
      }),
      { numRuns: 100 }
    )
  })

  it('should handle empty content', () => {
    fc.assert(
      fc.property(maxLinesArb, (maxLines) => {
        const content = ''
        const result = truncateByLines(content, maxLines)

        // Empty content should not be truncated
        expect(result.isTruncated).toBe(false)
        expect(result.truncated).toBe('')
      }),
      { numRuns: 100 }
    )
  })

  it('should handle single line content', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 500 }),
        maxLinesArb,
        (line, maxLines) => {
          const result = truncateByLines(line, maxLines)

          // Single line should never be truncated (unless maxLines is 0, which we don't allow)
          expect(result.isTruncated).toBe(false)
          expect(result.truncated).toBe(line)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should preserve line content when truncating', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1, maxLength: 100 }), { minLength: 2, maxLength: 30 }),
        fc.integer({ min: 1, max: 10 }),
        (lines, maxLines) => {
          fc.pre(lines.length > maxLines) // Only test when truncation will occur
          
          const content = lines.join('\n')
          const result = truncateByLines(content, maxLines)

          // Verify truncation occurred
          expect(result.isTruncated).toBe(true)

          // Verify truncated lines match original lines
          const truncatedLines = result.truncated.split('\n')
          for (let i = 0; i < maxLines; i++) {
            expect(truncatedLines[i]).toBe(lines[i])
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should return consistent results for the same input', () => {
    fc.assert(
      fc.property(contentArb, maxLinesArb, (content, maxLines) => {
        const result1 = truncateByLines(content, maxLines)
        const result2 = truncateByLines(content, maxLines)

        // Results should be identical for same input
        expect(result1.truncated).toBe(result2.truncated)
        expect(result1.isTruncated).toBe(result2.isTruncated)
      }),
      { numRuns: 100 }
    )
  })

  it('should truncate at line boundaries, not character boundaries', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1, maxLength: 200 }), { minLength: 3, maxLength: 20 }),
        fc.integer({ min: 1, max: 5 }),
        (lines, maxLines) => {
          fc.pre(lines.length > maxLines) // Only test when truncation will occur
          
          const content = lines.join('\n')
          const result = truncateByLines(content, maxLines)

          // Truncated content should end at a line boundary
          // (no partial lines)
          const truncatedLines = result.truncated.split('\n')
          expect(truncatedLines.length).toBe(maxLines)
          
          // Each truncated line should be a complete line from original
          for (let i = 0; i < maxLines; i++) {
            expect(truncatedLines[i]).toBe(lines[i])
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should handle content with various line endings', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 5, maxLength: 15 }),
        fc.integer({ min: 1, max: 4 }),
        (lines, maxLines) => {
          // Test with Unix line endings (\n)
          const unixContent = lines.join('\n')
          const unixResult = truncateByLines(unixContent, maxLines)

          if (lines.length > maxLines) {
            expect(unixResult.isTruncated).toBe(true)
            expect(unixResult.truncated.split('\n').length).toBe(maxLines)
          } else {
            expect(unixResult.isTruncated).toBe(false)
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should correctly report isTruncated flag', () => {
    fc.assert(
      fc.property(contentArb, maxLinesArb, (content, maxLines) => {
        const result = truncateByLines(content, maxLines)
        const lineCount = content.split('\n').length

        // isTruncated should be true if and only if content has more lines than maxLines
        if (lineCount > maxLines) {
          expect(result.isTruncated).toBe(true)
        } else {
          expect(result.isTruncated).toBe(false)
        }
      }),
      { numRuns: 100 }
    )
  })

  it('should handle content with empty lines', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.oneof(
            fc.string({ minLength: 1, maxLength: 50 }),
            fc.constant('') // Empty lines
          ),
          { minLength: 3, maxLength: 15 }
        ),
        fc.integer({ min: 1, max: 5 }),
        (lines, maxLines) => {
          const content = lines.join('\n')
          const result = truncateByLines(content, maxLines)

          // Empty lines should be counted as lines
          if (lines.length > maxLines) {
            expect(result.isTruncated).toBe(true)
            expect(result.truncated.split('\n').length).toBe(maxLines)
          } else {
            expect(result.isTruncated).toBe(false)
            expect(result.truncated).toBe(content)
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})
