import { useState, useEffect, useCallback } from 'react'
import { authApi } from '../services/api'

export function useAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [loading, setLoading] = useState(true)

  const checkAuth = useCallback(async () => {
    try {
      // Cookie is sent automatically with credentials: 'include'
      await authApi.verify()
      setIsAuthenticated(true)
    } catch {
      setIsAuthenticated(false)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  const login = async (username: string, password: string) => {
    const response = await authApi.login(username, password)
    // Cookie is set by the server (httpOnly)
    setIsAuthenticated(true)
    return response
  }

  const logout = async () => {
    try {
      await authApi.logout()
    } finally {
      // Cookie is cleared by the server
      setIsAuthenticated(false)
    }
  }

  return {
    isAuthenticated,
    loading,
    login,
    logout,
    checkAuth,
  }
}
