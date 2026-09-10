import { sites } from '@openai/sites-vite-plugin'
import react from '@vitejs/plugin-react'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'

const sitesWorkerSource = `
const acceptsHtml = (request) =>
  request.method === 'GET' && (request.headers.get('accept') || '').includes('text/html')

export default {
  async fetch(request, env) {
    if (!env?.ASSETS?.fetch) {
      return new Response('EXO Forge Studio static asset binding is unavailable.', { status: 503 })
    }

    const response = await env.ASSETS.fetch(request)
    if (response.status !== 404 || !acceptsHtml(request)) return response

    const shell = new Request(new URL('/index.html', request.url), request)
    return env.ASSETS.fetch(shell)
  },
}
`

function sitesWorkerEntrypoint(): Plugin {
  return {
    name: 'exo-sites-worker-entrypoint',
    apply: 'build',
    enforce: 'post',
    async closeBundle() {
      const serverDirectory = resolve(process.cwd(), 'dist/server')
      await mkdir(serverDirectory, { recursive: true })
      await writeFile(resolve(serverDirectory, 'index.js'), sitesWorkerSource.trimStart())
    },
  }
}

export default defineConfig({
  plugins: [
    react(),
    ...(existsSync(resolve(process.cwd(), '.openai/hosting.json'))
      ? [sites(), sitesWorkerEntrypoint()]
      : []),
  ],
  server: { host: '127.0.0.1', port: 4177 },
  build: { target: 'es2022', sourcemap: true },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
})
