import { Outlet, useNavigate } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { authApi } from '@/services/api'

export function MainLayout() {
  const navigate = useNavigate()

  const handleLogout = async () => {
    try {
      await authApi.logout()
    } catch {
      // Ignore errors
    }
    localStorage.removeItem('token')
    navigate('/login')
  }

  return (
    <div className="flex h-screen bg-background">
      <Sidebar onLogout={handleLogout} />
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
