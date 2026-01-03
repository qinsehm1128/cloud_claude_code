import { message } from 'antd'

interface ApiError {
  response?: {
    status?: number
    data?: {
      error?: string
      message?: string
    }
  }
  message?: string
}

export function handleApiError(error: unknown, defaultMessage = 'An error occurred'): string {
  const apiError = error as ApiError
  
  // Get error message from response
  const errorMessage = 
    apiError.response?.data?.error ||
    apiError.response?.data?.message ||
    apiError.message ||
    defaultMessage

  // Handle specific status codes
  const status = apiError.response?.status
  
  switch (status) {
    case 401:
      // Unauthorized - handled by axios interceptor
      return 'Authentication required'
    case 403:
      return 'Access denied'
    case 404:
      return 'Resource not found'
    case 422:
      return errorMessage // Validation error
    case 500:
      return 'Server error. Please try again later.'
    case 503:
      return 'Service unavailable. Please try again later.'
    default:
      return errorMessage
  }
}

export function showApiError(error: unknown, defaultMessage = 'An error occurred'): void {
  const errorMessage = handleApiError(error, defaultMessage)
  message.error(errorMessage)
}

export function showSuccess(msg: string): void {
  message.success(msg)
}

export function showWarning(msg: string): void {
  message.warning(msg)
}

export function showInfo(msg: string): void {
  message.info(msg)
}
