import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, lazy, Suspense } from 'react'
import { useAuth } from './hooks/useAuth'
import { ThemeProvider } from './hooks/useTheme'
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

// Lazy load HeadlessTerminal for code splitting
const HeadlessTerminal = lazy(() => import('./pages/HeadlessTerminal'))
const HeadlessChat = lazy(() => import('./pages/HeadlessChat'))

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
    <ThemeProvider>
      <ToastProvider>
        <ToastInitializer />
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            {/* Headless Chat - standalone layout */}
            <Route
              path="/chat"
              element={
                <PrivateRoute>
                  <Suspense fallback={<div className="flex items-center justify-center h-screen"><Loader2 className="h-8 w-8 animate-spin" /></div>}>
                    <HeadlessChat />
                  </Suspense>
                </PrivateRoute>
              }
            />
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
              <Route path="headless/:containerId" element={
                <Suspense fallback={<div className="flex items-center justify-center h-full"><Loader2 className="h-8 w-8 animate-spin" /></div>}>
                  <HeadlessTerminal />
                </Suspense>
              } />
            </Route>
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </ThemeProvider>
  )
}

export default App
