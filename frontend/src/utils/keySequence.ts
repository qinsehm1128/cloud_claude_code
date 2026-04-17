/**
 * Key sequence utilities for terminal input
 * Handles control character generation and modifier key combinations
 */

/**
 * Control character mapping for Ctrl+letter combinations
 * Maps lowercase letters to their corresponding control characters
 */
export const CTRL_CHAR_MAP: Record<string, string> = {
  'a': '\x01', // SOH - Start of Heading
  'b': '\x02', // STX - Start of Text
  'c': '\x03', // ETX - End of Text (interrupt)
  'd': '\x04', // EOT - End of Transmission (EOF)
  'e': '\x05', // ENQ - Enquiry
  'f': '\x06', // ACK - Acknowledge
  'g': '\x07', // BEL - Bell
  'h': '\x08', // BS - Backspace
  'i': '\x09', // HT - Horizontal Tab
  'j': '\x0a', // LF - Line Feed
  'k': '\x0b', // VT - Vertical Tab
  'l': '\x0c', // FF - Form Feed (clear screen)
  'm': '\x0d', // CR - Carriage Return
  'n': '\x0e', // SO - Shift Out
  'o': '\x0f', // SI - Shift In
  'p': '\x10', // DLE - Data Link Escape
  'q': '\x11', // DC1 - Device Control 1 (XON)
  'r': '\x12', // DC2 - Device Control 2
  's': '\x13', // DC3 - Device Control 3 (XOFF)
  't': '\x14', // DC4 - Device Control 4
  'u': '\x15', // NAK - Negative Acknowledge
  'v': '\x16', // SYN - Synchronous Idle
  'w': '\x17', // ETB - End of Transmission Block
  'x': '\x18', // CAN - Cancel
  'y': '\x19', // EM - End of Medium
  'z': '\x1a', // SUB - Substitute (suspend)
}

/**
 * ANSI escape sequences for special keys
 */
export const SPECIAL_KEYS = {
  TAB: '\t',
  ESCAPE: '\x1b',
  ENTER: '\r',
  BACKSPACE: '\x7f',
  DELETE: '\x1b[3~',
  // Arrow keys
  ARROW_UP: '\x1b[A',
  ARROW_DOWN: '\x1b[B',
  ARROW_RIGHT: '\x1b[C',
  ARROW_LEFT: '\x1b[D',
  // Home/End
  HOME: '\x1b[H',
  END: '\x1b[F',
  // Page Up/Down
  PAGE_UP: '\x1b[5~',
  PAGE_DOWN: '\x1b[6~',
} as const

/**
 * Generate a key sequence with optional modifier keys
 * 
 * @param char - The character to send
 * @param ctrl - Whether Ctrl modifier is active
 * @param alt - Whether Alt modifier is active
 * @returns The key sequence to send to the terminal
 */
export function generateKeySequence(
  char: string,
  ctrl: boolean = false,
  alt: boolean = false
): string {
  if (!char) {
    return ''
  }

  let result = char

  // Handle Ctrl modifier
  if (ctrl) {
    const lowerChar = char.toLowerCase()
    if (lowerChar in CTRL_CHAR_MAP) {
      result = CTRL_CHAR_MAP[lowerChar]
    }
  }

  // Handle Alt modifier (sends ESC prefix)
  if (alt) {
    result = '\x1b' + result
  }

  return result
}

/**
 * Get the control character for a given letter
 * 
 * @param char - The character (a-z)
 * @returns The control character or undefined if not a letter
 */
export function getCtrlChar(char: string): string | undefined {
  return CTRL_CHAR_MAP[char.toLowerCase()]
}

/**
 * Check if a character has a control character mapping
 * 
 * @param char - The character to check
 * @returns True if the character has a control mapping
 */
export function hasCtrlMapping(char: string): boolean {
  return char.toLowerCase() in CTRL_CHAR_MAP
}

/**
 * Predefined quick key definitions
 */
export interface QuickKeyDef {
  label: string
  keys: string
  description?: string
}

export const QUICK_KEYS: QuickKeyDef[] = [
  { label: 'Ctrl+C', keys: '\x03', description: 'Interrupt/Cancel' },
  { label: 'Ctrl+D', keys: '\x04', description: 'EOF/Exit' },
  { label: 'Ctrl+Z', keys: '\x1a', description: 'Suspend' },
  { label: 'Ctrl+L', keys: '\x0c', description: 'Clear screen' },
  { label: 'Tab', keys: '\t', description: 'Auto-complete' },
  { label: 'Esc', keys: '\x1b', description: 'Escape' },
  { label: '↑', keys: '\x1b[A', description: 'Previous command' },
  { label: '↓', keys: '\x1b[B', description: 'Next command' },
  { label: '←', keys: '\x1b[D', description: 'Move cursor left' },
  { label: '→', keys: '\x1b[C', description: 'Move cursor right' },
]

/**
 * Essential quick keys for minimal/collapsed mode
 */
export const MINIMAL_QUICK_KEYS: QuickKeyDef[] = [
  { label: 'Ctrl+C', keys: '\x03', description: 'Interrupt' },
  { label: 'Tab', keys: '\t', description: 'Complete' },
  { label: '↑', keys: '\x1b[A', description: 'History' },
  { label: '↓', keys: '\x1b[B', description: 'History' },
]
