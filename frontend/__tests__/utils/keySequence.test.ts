import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import {
  generateKeySequence,
  getCtrlChar,
  hasCtrlMapping,
  CTRL_CHAR_MAP,
  SPECIAL_KEYS,
  QUICK_KEYS,
  MINIMAL_QUICK_KEYS,
} from '@/utils/keySequence'

describe('keySequence utilities', () => {
  describe('CTRL_CHAR_MAP', () => {
    it('should have mappings for all lowercase letters a-z', () => {
      for (let i = 0; i < 26; i++) {
        const char = String.fromCharCode(97 + i) // 'a' to 'z'
        expect(CTRL_CHAR_MAP[char]).toBeDefined()
      }
    })

    it('should map to correct control characters', () => {
      // Ctrl+A = 0x01, Ctrl+B = 0x02, etc.
      for (let i = 0; i < 26; i++) {
        const char = String.fromCharCode(97 + i)
        const expected = String.fromCharCode(i + 1)
        expect(CTRL_CHAR_MAP[char]).toBe(expected)
      }
    })
  })

  describe('generateKeySequence', () => {
    /**
     * Property 11: Modifier Key Combination
     * For any character typed while Ctrl modifier is active,
     * the sent sequence SHALL be the corresponding control character.
     * Validates: Requirements 5.2
     */
    it('Property 11: should generate correct control character for any letter with Ctrl', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 25 }),
          (index) => {
            const char = String.fromCharCode(97 + index) // 'a' to 'z'
            const result = generateKeySequence(char, true, false)
            const expectedCtrlChar = String.fromCharCode(index + 1)
            expect(result).toBe(expectedCtrlChar)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should return empty string for empty input', () => {
      expect(generateKeySequence('', false, false)).toBe('')
      expect(generateKeySequence('', true, false)).toBe('')
      expect(generateKeySequence('', false, true)).toBe('')
    })

    it('should return character unchanged without modifiers', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 1 }),
          (char) => {
            const result = generateKeySequence(char, false, false)
            expect(result).toBe(char)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should prefix with ESC for Alt modifier', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 1 }),
          (char) => {
            const result = generateKeySequence(char, false, true)
            expect(result).toBe('\x1b' + char)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should handle both Ctrl and Alt modifiers', () => {
      // Ctrl+Alt+c should be ESC + Ctrl+C
      const result = generateKeySequence('c', true, true)
      expect(result).toBe('\x1b\x03')
    })

    it('should handle uppercase letters with Ctrl', () => {
      const result = generateKeySequence('C', true, false)
      expect(result).toBe('\x03') // Same as lowercase
    })
  })

  describe('getCtrlChar', () => {
    it('should return control character for valid letters', () => {
      expect(getCtrlChar('c')).toBe('\x03')
      expect(getCtrlChar('d')).toBe('\x04')
      expect(getCtrlChar('z')).toBe('\x1a')
    })

    it('should handle uppercase letters', () => {
      expect(getCtrlChar('C')).toBe('\x03')
      expect(getCtrlChar('D')).toBe('\x04')
    })

    it('should return undefined for non-letters', () => {
      expect(getCtrlChar('1')).toBeUndefined()
      expect(getCtrlChar('!')).toBeUndefined()
      expect(getCtrlChar(' ')).toBeUndefined()
    })
  })

  describe('hasCtrlMapping', () => {
    it('should return true for all letters', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 25 }),
          (index) => {
            const lowerChar = String.fromCharCode(97 + index)
            const upperChar = String.fromCharCode(65 + index)
            expect(hasCtrlMapping(lowerChar)).toBe(true)
            expect(hasCtrlMapping(upperChar)).toBe(true)
          }
        ),
        { numRuns: 26 }
      )
    })

    it('should return false for non-letters', () => {
      expect(hasCtrlMapping('1')).toBe(false)
      expect(hasCtrlMapping('!')).toBe(false)
      expect(hasCtrlMapping(' ')).toBe(false)
    })
  })

  describe('SPECIAL_KEYS', () => {
    it('should have correct ANSI sequences for arrow keys', () => {
      expect(SPECIAL_KEYS.ARROW_UP).toBe('\x1b[A')
      expect(SPECIAL_KEYS.ARROW_DOWN).toBe('\x1b[B')
      expect(SPECIAL_KEYS.ARROW_RIGHT).toBe('\x1b[C')
      expect(SPECIAL_KEYS.ARROW_LEFT).toBe('\x1b[D')
    })

    it('should have correct values for common keys', () => {
      expect(SPECIAL_KEYS.TAB).toBe('\t')
      expect(SPECIAL_KEYS.ESCAPE).toBe('\x1b')
      expect(SPECIAL_KEYS.ENTER).toBe('\r')
    })
  })

  describe('QUICK_KEYS', () => {
    it('should have all required quick keys', () => {
      const labels = QUICK_KEYS.map(k => k.label)
      expect(labels).toContain('Ctrl+C')
      expect(labels).toContain('Ctrl+D')
      expect(labels).toContain('Ctrl+Z')
      expect(labels).toContain('Ctrl+L')
      expect(labels).toContain('Tab')
      expect(labels).toContain('Esc')
      expect(labels).toContain('↑')
      expect(labels).toContain('↓')
      expect(labels).toContain('←')
      expect(labels).toContain('→')
    })

    it('should have correct key sequences', () => {
      const ctrlC = QUICK_KEYS.find(k => k.label === 'Ctrl+C')
      expect(ctrlC?.keys).toBe('\x03')

      const tab = QUICK_KEYS.find(k => k.label === 'Tab')
      expect(tab?.keys).toBe('\t')

      const arrowUp = QUICK_KEYS.find(k => k.label === '↑')
      expect(arrowUp?.keys).toBe('\x1b[A')
    })
  })

  describe('MINIMAL_QUICK_KEYS', () => {
    it('should be a subset of QUICK_KEYS', () => {
      const quickKeyLabels = QUICK_KEYS.map(k => k.label)
      MINIMAL_QUICK_KEYS.forEach(minKey => {
        expect(quickKeyLabels).toContain(minKey.label)
      })
    })

    it('should include essential keys', () => {
      const labels = MINIMAL_QUICK_KEYS.map(k => k.label)
      expect(labels).toContain('Ctrl+C')
      expect(labels).toContain('Tab')
    })
  })
})
