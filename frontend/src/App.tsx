import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import { useAuth } from './hooks/useAuth'
import { MainLayout } from './components/layout/MainLayout'
import { ToastProvider, useToast, setGlobalToast } from './components/ui/toast'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Settings from './pages/Settings'
import ContainerTerminal from './pages/ContainerTerminal'
import Ports from './pages/Ports'
import DockerContainers from './pages/DockerContainers'
import AutomationLogs from './pages/AutomationLogs'
import { Loader2 } from 'lucide-react'

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return isAuthenticated ? <>{children}</> : <Navigate to="/login" />
}

// Component to initialize global toast
function ToastInitializer() {
  const { addToast } = useToast()
  
  useEffect(() => {
    setGlobalToast(addToast)
  }, [addToast])
  
  return null
}

function App() {
  return (
    <ToastProvider>
      <ToastInitializer />
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <PrivateRoute>
                <MainLayout />
              </PrivateRoute>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="settings" element={<Settings />} />
            <Route path="ports" element={<Ports />} />
            <Route path="docker" element={<DockerContainers />} />
            <Route path="automation-logs" element={<AutomationLogs />} />
            <Route path="terminal/:containerId" element={<ContainerTerminal />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  )
}

export default App
