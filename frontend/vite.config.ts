import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'fs'

// Load .env from parent directory
function loadParentEnv(mode: string): Record<string, string> {
  const env: Record<string, string> = {}
  
  // Try to load from parent directory
  const parentEnvPath = path.resolve(__dirname, '../.env')
  if (fs.existsSync(parentEnvPath)) {
    const content = fs.readFileSync(parentEnvPath, 'utf-8')
    content.split('\n').forEach(line => {
      line = line.trim()
      if (line && !line.startsWith('#')) {
        const [key, ...valueParts] = line.split('=')
        if (key && valueParts.length > 0) {
          let value = valueParts.join('=').trim()
          // Remove quotes
          value = value.replace(/^["']|["']$/g, '')
          env[key.trim()] = value
        }
      }
    })
  }
  
  return env
}

export default defineConfig(({ mode }) => {
  // Load env from parent directory
  const parentEnv = loadParentEnv(mode)
  
  // Get ports from env
  const backendPort = parseInt(parentEnv.PORT || '8080')
  const frontendPort = parseInt(parentEnv.FRONTEND_PORT || '3000')
  
  return {
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: {
      host: '0.0.0.0',
      port: frontendPort,
      proxy: {
        '/api': {
          target: `http://localhost:${backendPort}`,
          changeOrigin: true,
          ws: true,
        },
      },
    },
    // Make env variables available to the app
    define: {
      '__BACKEND_PORT__': backendPort,
    },
  }
})
