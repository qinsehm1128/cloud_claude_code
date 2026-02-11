import { useState } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { Menu, Terminal } from 'lucide-react'
import { Sidebar } from './Sidebar'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { useIsMobile } from '@/hooks/useMediaQuery'
import { authApi } from '@/services/api'

export function MainLayout() {
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false)

  const handleLogout = async () => {
    try {
      await authApi.logout()
    } catch {
      // Ignore errors
    }
    localStorage.removeItem('token')
    navigate('/login')
  }

  if (isMobile) {
    return (
      <div className="flex h-screen flex-col bg-background">
        <header className="flex h-14 items-center gap-3 border-b bg-card px-4">
          <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="h-10 w-10">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Open navigation menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 border-r p-0">
              <Sidebar
                onLogout={handleLogout}
                mobileOpen={sidebarOpen}
                onMobileClose={() => setSidebarOpen(false)}
              />
            </SheetContent>
          </Sheet>
          <div className="flex items-center gap-2">
            <Terminal className="h-5 w-5" />
            <span className="font-semibold">Claude Code</span>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-background">
      <Sidebar onLogout={handleLogout} />
      <main className="min-h-0 flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
