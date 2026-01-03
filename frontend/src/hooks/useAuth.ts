import { useState, useEffect, useCallback } from 'react'
import { authApi } from '../services/api'

export function useAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [loading, setLoading] = useState(true)

  const checkAuth = useCallback(async () => {
    const token = localStorage.getItem('token')
    if (!token) {
      setIsAuthenticated(false)
      setLoading(false)
      return
    }

    try {
      await authApi.verify()
      setIsAuthenticated(true)
    } catch {
      localStorage.removeItem('token')
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
    const { token } = response.data
    localStorage.setItem('token', token)
    setIsAuthenticated(true)
    return response
  }

  const logout = async () => {
    try {
      await authApi.logout()
    } finally {
      localStorage.removeItem('token')
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
