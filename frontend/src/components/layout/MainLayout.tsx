import { useState } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { Menu, Terminal } from 'lucide-react'
import { Sidebar } from './Sidebar'
import { Button } from '@/components/ui/button'
import { authApi } from '@/services/api'

export function MainLayout() {
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)

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
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      
      {/* Sidebar */}
      <Sidebar 
        onLogout={handleLogout} 
        mobileOpen={sidebarOpen}
        onMobileClose={() => setSidebarOpen(false)}
      />
      
      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile header */}
        <header className="flex items-center h-14 px-4 border-b bg-card md:hidden">
          <Button
            variant="ghost"
            size="sm"
            className="h-10 w-10 p-0"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2 ml-3">
            <Terminal className="h-5 w-5" />
            <span className="font-semibold">Claude Code</span>
          </div>
        </header>
        
        {/* Page content */}
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
