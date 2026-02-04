import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { AxiosResponse } from 'axios'

// Mock the api module - vi.mock is hoisted, so we use vi.fn() directly
vi.mock('@/services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

// Import after mocking
import { claudeConfigApi } from '@/services/claudeConfigApi'
import api from '@/services/api'
import type { ClaudeConfigTemplate, CreateConfigInput, UpdateConfigInput, ConfigType } from '@/types/claudeConfig'

// Get the mocked api
const mockApi = vi.mocked(api)

// Helper to create mock response
const createMockResponse = <T>(data: T): AxiosResponse<T> => ({
  data,
  status: 200,
  statusText: 'OK',
  headers: {},
  config: {} as any,
})

// Sample test data
const sampleTemplate: ClaudeConfigTemplate = {
  id: 1,
  name: 'Test Template',
  config_type: 'CLAUDE_MD',
  content: '# Test Content',
  description: 'Test description',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
}

const sampleTemplates: ClaudeConfigTemplate[] = [
  sampleTemplate,
  {
    id: 2,
    name: 'Skill Template',
    config_type: 'SKILL',
    content: '---\nallowed_tools: []\n---\n# Skill',
    created_at: '2024-01-02T00:00:00Z',
    updated_at: '2024-01-02T00:00:00Z',
  },
  {
    id: 3,
    name: 'MCP Template',
    config_type: 'MCP',
    content: '{"command": "node", "args": ["server.js"]}',
    created_at: '2024-01-03T00:00:00Z',
    updated_at: '2024-01-03T00:00:00Z',
  },
]

describe('claudeConfigApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('list method', () => {
    it('should call GET /claude-configs without params when no type specified', async () => {
      mockApi.get.mockResolvedValue(createMockResponse(sampleTemplates))

      const result = await claudeConfigApi.list()

      expect(mockApi.get).toHaveBeenCalledTimes(1)
      expect(mockApi.get).toHaveBeenCalledWith('/claude-configs', {
        params: undefined,
      })
      expect(result.data).toEqual(sampleTemplates)
    })

    it('should call GET /claude-configs with type param when type is specified', async () => {
      const skillTemplates = sampleTemplates.filter(t => t.config_type === 'SKILL')
      mockApi.get.mockResolvedValue(createMockResponse(skillTemplates))

      const result = await claudeConfigApi.list('SKILL')

      expect(mockApi.get).toHaveBeenCalledTimes(1)
      expect(mockApi.get).toHaveBeenCalledWith('/claude-configs', {
        params: { type: 'SKILL' },
      })
      expect(result.data).toEqual(skillTemplates)
    })

    it('should handle all config types as filter', async () => {
      const configTypes: ConfigType[] = ['CLAUDE_MD', 'SKILL', 'MCP', 'COMMAND']

      for (const type of configTypes) {
        mockApi.get.mockResolvedValue(createMockResponse([]))
        
        await claudeConfigApi.list(type)

        expect(mockApi.get).toHaveBeenCalledWith('/claude-configs', {
          params: { type },
        })
      }
    })

    it('should return empty array when no templates exist', async () => {
      mockApi.get.mockResolvedValue(createMockResponse([]))

      const result = await claudeConfigApi.list()

      expect(result.data).toEqual([])
    })
  })

  describe('getById method', () => {
    it('should call GET /claude-configs/:id with correct ID', async () => {
      mockApi.get.mockResolvedValue(createMockResponse(sampleTemplate))

      const result = await claudeConfigApi.getById(1)

      expect(mockApi.get).toHaveBeenCalledTimes(1)
      expect(mockApi.get).toHaveBeenCalledWith('/claude-configs/1')
      expect(result.data).toEqual(sampleTemplate)
    })

    it('should handle different IDs correctly', async () => {
      const ids = [1, 42, 999, 12345]

      for (const id of ids) {
        mockApi.get.mockResolvedValue(createMockResponse({ ...sampleTemplate, id }))

        await claudeConfigApi.getById(id)

        expect(mockApi.get).toHaveBeenCalledWith(`/claude-configs/${id}`)
      }
    })

    it('should propagate error when template not found', async () => {
      const error = new Error('Not Found')
      mockApi.get.mockRejectedValue(error)

      await expect(claudeConfigApi.getById(999)).rejects.toThrow('Not Found')
    })

    it('should propagate network errors', async () => {
      const networkError = new Error('Network Error')
      mockApi.get.mockRejectedValue(networkError)

      await expect(claudeConfigApi.getById(1)).rejects.toThrow('Network Error')
    })
  })

  describe('create method', () => {
    it('should call POST /claude-configs with correct data', async () => {
      const createInput: CreateConfigInput = {
        name: 'New Template',
        config_type: 'CLAUDE_MD',
        content: '# New Content',
        description: 'New description',
      }
      const createdTemplate: ClaudeConfigTemplate = {
        ...createInput,
        id: 10,
        created_at: '2024-01-10T00:00:00Z',
        updated_at: '2024-01-10T00:00:00Z',
      }
      mockApi.post.mockResolvedValue(createMockResponse(createdTemplate))

      const result = await claudeConfigApi.create(createInput)

      expect(mockApi.post).toHaveBeenCalledTimes(1)
      expect(mockApi.post).toHaveBeenCalledWith('/claude-configs', createInput)
      expect(result.data).toEqual(createdTemplate)
    })

    it('should handle create without optional description', async () => {
      const createInput: CreateConfigInput = {
        name: 'Minimal Template',
        config_type: 'SKILL',
        content: '# Skill Content',
      }
      mockApi.post.mockResolvedValue(createMockResponse({ ...createInput, id: 11 }))

      await claudeConfigApi.create(createInput)

      expect(mockApi.post).toHaveBeenCalledWith('/claude-configs', createInput)
    })

    it('should handle all config types for creation', async () => {
      const configTypes: ConfigType[] = ['CLAUDE_MD', 'SKILL', 'MCP', 'COMMAND']

      for (const type of configTypes) {
        const input: CreateConfigInput = {
          name: `${type} Template`,
          config_type: type,
          content: type === 'MCP' ? '{"command":"test","args":[]}' : '# Content',
        }
        mockApi.post.mockResolvedValue(createMockResponse({ ...input, id: 1 }))

        await claudeConfigApi.create(input)

        expect(mockApi.post).toHaveBeenCalledWith('/claude-configs', input)
      }
    })

    it('should propagate validation errors', async () => {
      const error = new Error('Bad Request: invalid config_type')
      mockApi.post.mockRejectedValue(error)

      const invalidInput: CreateConfigInput = {
        name: 'Invalid',
        config_type: 'INVALID' as ConfigType,
        content: '',
      }

      await expect(claudeConfigApi.create(invalidInput)).rejects.toThrow('Bad Request')
    })
  })

  describe('update method', () => {
    it('should call PUT /claude-configs/:id with correct data', async () => {
      const updateInput: UpdateConfigInput = {
        name: 'Updated Name',
        content: '# Updated Content',
      }
      const updatedTemplate: ClaudeConfigTemplate = {
        ...sampleTemplate,
        ...updateInput,
        updated_at: '2024-01-15T00:00:00Z',
      }
      mockApi.put.mockResolvedValue(createMockResponse(updatedTemplate))

      const result = await claudeConfigApi.update(1, updateInput)

      expect(mockApi.put).toHaveBeenCalledTimes(1)
      expect(mockApi.put).toHaveBeenCalledWith('/claude-configs/1', updateInput)
      expect(result.data).toEqual(updatedTemplate)
    })

    it('should handle partial updates', async () => {
      // Update only name
      const nameOnlyUpdate: UpdateConfigInput = { name: 'New Name Only' }
      mockApi.put.mockResolvedValue(createMockResponse({ ...sampleTemplate, name: 'New Name Only' }))

      await claudeConfigApi.update(1, nameOnlyUpdate)
      expect(mockApi.put).toHaveBeenCalledWith('/claude-configs/1', nameOnlyUpdate)

      // Update only content
      const contentOnlyUpdate: UpdateConfigInput = { content: '# New Content Only' }
      mockApi.put.mockResolvedValue(createMockResponse({ ...sampleTemplate, content: '# New Content Only' }))

      await claudeConfigApi.update(1, contentOnlyUpdate)
      expect(mockApi.put).toHaveBeenCalledWith('/claude-configs/1', contentOnlyUpdate)
    })

    it('should handle update with all fields', async () => {
      const fullUpdate: UpdateConfigInput = {
        name: 'Full Update',
        config_type: 'SKILL',
        content: '# Full Update Content',
        description: 'Full update description',
      }
      mockApi.put.mockResolvedValue(createMockResponse({ ...sampleTemplate, ...fullUpdate }))

      await claudeConfigApi.update(1, fullUpdate)

      expect(mockApi.put).toHaveBeenCalledWith('/claude-configs/1', fullUpdate)
    })

    it('should propagate error when template not found', async () => {
      const error = new Error('Not Found')
      mockApi.put.mockRejectedValue(error)

      await expect(claudeConfigApi.update(999, { name: 'Test' })).rejects.toThrow('Not Found')
    })
  })

  describe('delete method', () => {
    it('should call DELETE /claude-configs/:id with correct ID', async () => {
      mockApi.delete.mockResolvedValue({ status: 204 })

      await claudeConfigApi.delete(1)

      expect(mockApi.delete).toHaveBeenCalledTimes(1)
      expect(mockApi.delete).toHaveBeenCalledWith('/claude-configs/1')
    })

    it('should handle different IDs correctly', async () => {
      const ids = [1, 42, 999, 12345]

      for (const id of ids) {
        mockApi.delete.mockResolvedValue({ status: 204 })

        await claudeConfigApi.delete(id)

        expect(mockApi.delete).toHaveBeenCalledWith(`/claude-configs/${id}`)
      }
    })

    it('should propagate error when template not found', async () => {
      const error = new Error('Not Found')
      mockApi.delete.mockRejectedValue(error)

      await expect(claudeConfigApi.delete(999)).rejects.toThrow('Not Found')
    })

    it('should propagate server errors', async () => {
      const serverError = new Error('Internal Server Error')
      mockApi.delete.mockRejectedValue(serverError)

      await expect(claudeConfigApi.delete(1)).rejects.toThrow('Internal Server Error')
    })
  })
})
