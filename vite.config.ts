import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

export default defineConfig(() => {
  return {
    resolve: {
      alias: {
        '@clerk/clerk-react': path.resolve(__dirname, './src/hooks/useClerkCompat.ts'),
      },
    },
    plugins: [
      react(),
      VitePWA({
        strategies: 'injectManifest',
        srcDir: 'src',
        filename: 'sw.ts',
        registerType: 'autoUpdate',
        includeAssets: [
          'favicon.svg',
          'apple-touch-icon.png',
          'pwa-192x192.png',
          'pwa-512x512.png',
          'maskable-icon-512x512.png',
          'logo-bem-aviv.png',
        ],
        manifest: {
          name: 'Bem Aviv Hub',
          short_name: 'Bem Aviv Hub',
          description: 'Gestão comercial, CRM e financeira Bem Aviv',
          theme_color: '#0F3764',
          background_color: '#ffffff',
          display: 'standalone',
          orientation: 'portrait',
          start_url: '/',
          scope: '/',
          id: '/',
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/maskable-icon-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
            {
              src: '/favicon.svg',
              sizes: '512x512',
              type: 'image/svg+xml',
              purpose: 'any',
            },
          ],
          shortcuts: [
            {
              name: "EKO'7 — Visão Geral",
              short_name: 'Visão Geral',
              description: 'Painel comercial e metas EKO7',
              url: '/bem-aviv',
              icons: [{ src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' }],
            },
            {
              name: 'Follow-ups e Clientes',
              short_name: 'Follow-ups',
              description: 'Agenda e contatos prioritários',
              url: '/bem-aviv/follow-up',
              icons: [{ src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' }],
            },
            {
              name: 'V2 Distribuidor',
              short_name: 'V2 Distribuidor',
              description: 'Painel e CRM da Versão 2',
              url: '/v2/inicio',
              icons: [{ src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' }],
            },
            {
              name: 'Financeiro LSH',
              short_name: 'Financeiro',
              description: 'Contas e fluxo de caixa',
              url: '/lsh/resumo',
              icons: [{ src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' }],
            },
          ],
        },
      }),
    ],
  }
})
