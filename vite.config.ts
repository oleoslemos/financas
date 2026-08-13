import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  let supabaseHostRegex: RegExp | null = null
  try {
    const u = env.VITE_SUPABASE_URL?.trim()
    if (u) {
      const host = new URL(u).hostname
      if (host)
        supabaseHostRegex = new RegExp(`^https://${host.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/`, 'i')
    }
  } catch {
    /* URL inválida no build: ignora regra dedicada */
  }

  const runtimeCaching = [
    ...(supabaseHostRegex
      ? ([{ urlPattern: supabaseHostRegex, handler: 'NetworkOnly' as const }] as const)
      : []),
    { urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i, handler: 'NetworkOnly' as const },
    { urlPattern: /^https:\/\/.*\.supabase\.in\/.*/i, handler: 'NetworkOnly' as const },
    {
      urlPattern: /^https:\/\/.*\.clerk\.accounts\.dev\/.*/i,
      handler: 'NetworkOnly' as const,
    },
    { urlPattern: /^https:\/\/clerk\.com\/.*/i, handler: 'NetworkOnly' as const },
    { urlPattern: /^https:\/\/.*\.clerk\.com\/.*/i, handler: 'NetworkOnly' as const },
  ]

  return {
    resolve: {
      alias: {
        '@clerk/clerk-react': path.resolve(__dirname, './src/hooks/useClerkCompat.ts'),
      },
    },
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.svg'],
        // Evita o SW interceptar APIs externas (Supabase/Clerk) e quebrar com "Failed to fetch".
        // Inclui o hostname exato de VITE_SUPABASE_URL (ex.: domínio customizado ou outro TLD).
        workbox: {
          runtimeCaching: [...runtimeCaching],
        },
        manifest: {
          name: 'LSH',
          short_name: 'LSH',
          description: 'Planejamento financeiro pessoal',
          theme_color: '#ffffff',
          background_color: '#ffffff',
          display: 'standalone',
          icons: [
            {
              src: '/favicon.svg',
              sizes: '512x512',
              type: 'image/svg+xml',
              purpose: 'any maskable',
            },
          ],
          shortcuts: [
            {
              name: 'Novo Lançamento',
              short_name: 'Lançamento',
              description: 'Criar um novo lançamento financeiro',
              url: '/lsh/fluxo?action=new',
              icons: [
                {
                  src: '/favicon.svg',
                  sizes: '512x512',
                  type: 'image/svg+xml'
                }
              ]
            },
            {
              name: 'Ver Dashboard',
              short_name: 'Dashboard',
              description: 'Visualizar resumo financeiro',
              url: '/lsh/dashboard',
              icons: [
                {
                  src: '/favicon.svg',
                  sizes: '512x512',
                  type: 'image/svg+xml'
                }
              ]
            }
          ]
        },
      }),
    ],
  }
})
