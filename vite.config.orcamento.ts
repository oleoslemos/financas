/**
 * vite.config.orcamento.ts
 *
 * Build dedicado para o PWA "Orçamento Mobile — Bem Aviv".
 * Usado pelo segundo projeto Vercel (orcamento-bemaviv.vercel.app).
 *
 * É o mesmo código React, mas o manifest PWA é totalmente diferente:
 *   - Nome: "Orçamento Mobile"
 *   - Ícone: verde
 *   - start_url: /v2/orcamento/login
 *   - scope: /  (necessário para funcionar no mesmo origin)
 *   - theme_color: #7DC344
 */
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
          'pwa-orcamento-192x192.png',
          'pwa-512x512.png',
          'maskable-icon-512x512.png',
          'logo-bem-aviv.png',
        ],
        manifest: {
          name: 'Orçamento Mobile — Bem Aviv',
          short_name: 'Orçamentos',
          description: 'Tabela de preços, orçamentos e CRM para vendedores Bem Aviv',
          theme_color: '#7DC344',
          background_color: '#F4F8F3',
          display: 'standalone',
          orientation: 'any',
          // start_url aponta diretamente para o módulo de orçamento
          start_url: '/v2/orcamento/login',
          scope: '/',
          id: '/v2/orcamento/',
          icons: [
            {
              src: '/pwa-orcamento-192x192.png',
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
          ],
          shortcuts: [
            {
              name: 'Nova Proposta',
              short_name: 'Nova Proposta',
              description: 'Criar um novo orçamento',
              url: '/v2/orcamento/propostas/nova',
              icons: [{ src: '/pwa-orcamento-192x192.png', sizes: '192x192', type: 'image/png' }],
            },
            {
              name: 'Tabela de Preços',
              short_name: 'Preços',
              description: 'Consultar tabela de preços',
              url: '/v2/orcamento/tabela-preco',
              icons: [{ src: '/pwa-orcamento-192x192.png', sizes: '192x192', type: 'image/png' }],
            },
            {
              name: 'Clientes',
              short_name: 'Clientes',
              description: 'Ver clientes e agenda de CRM',
              url: '/v2/orcamento/clientes',
              icons: [{ src: '/pwa-orcamento-192x192.png', sizes: '192x192', type: 'image/png' }],
            },
          ],
          categories: ['business', 'productivity'],
          lang: 'pt-BR',
          dir: 'ltr',
        },
      }),
    ],
  }
})
