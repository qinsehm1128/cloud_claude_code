# User Guide

## Mobile Terminal Features

### Auxiliary Keyboard

On mobile devices (viewport width <= 768px), an auxiliary keyboard appears below the terminal to provide quick access to common commands and scrolling controls that are difficult to type on touchscreens.

#### Preset Commands

The auxiliary keyboard provides the following preset command buttons:

| Button | Command | Description |
|--------|---------|-------------|
| cd ..  | `cd ..` | Navigate to parent directory |
| ls -la | `ls -la` | List files with details |
| pwd    | `pwd`   | Print working directory |
| clear  | `clear` | Clear terminal screen |
| exit   | `exit`  | Exit current session |

Each button has a minimum touch target of 44px for comfortable mobile interaction.

#### Scroll Controls

Two scroll buttons are provided at the end of the keyboard:

- **Up** - Scrolls the terminal content up by 10 lines
- **Down** - Scrolls the terminal content down by 10 lines

These resolve the conflict between web page scrolling and terminal content scrolling on mobile devices.

#### Usage

1. Open a container terminal on a mobile device
2. The auxiliary keyboard appears automatically below the terminal viewport
3. Tap any preset command button to execute it immediately in the terminal
4. Use the Up/Down scroll buttons to navigate terminal history
5. On desktop viewports (>768px), the auxiliary keyboard is hidden

#### Custom Commands

The auxiliary keyboard supports custom preset commands through the `presetCommands` prop. Each command requires:

- `id` - Unique identifier
- `label` - Display text on the button
- `command` - The shell command to execute (include `\n` to auto-submit)
- `icon` - A Lucide icon component

## CLI Workflow Integration

See [CLI_WORKFLOW.md](./CLI_WORKFLOW.md) for the complete CLI tool workflow guide.

## Troubleshooting

See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for common issues and solutions.
