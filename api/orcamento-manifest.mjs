/**
 * Vercel API Route: /api/orcamento-manifest
 * Serves a dedicated PWA Web App Manifest for the Orçamento Mobile module.
 * This allows the module to be installed as a separate PWA on the user's
 * home screen, independent of the main Bem Aviv Hub app.
 *
 * Usage: Add <link rel="manifest" href="/api/orcamento-manifest"> to a
 * dedicated HTML shell, or redirect browsers to this manifest when on
 * /v2/orcamento/* routes.
 */

export default function handler(req, res) {
  const manifest = {
    name: 'Orçamento Mobile — Bem Aviv',
    short_name: 'Orçamentos',
    description: 'Tabela de preços, elaboração de orçamentos e CRM para vendedores Bem Aviv',
    theme_color: '#7DC344',
    background_color: '#F4F8F3',
    display: 'standalone',
    orientation: 'any',
    start_url: '/v2/orcamento/login',
    scope: '/v2/orcamento/',
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
        description: 'Criar um novo orçamento para o cliente',
        url: '/v2/orcamento/propostas/nova',
        icons: [{ src: '/pwa-orcamento-192x192.png', sizes: '192x192', type: 'image/png' }],
      },
      {
        name: 'Tabela de Preços',
        short_name: 'Preços',
        description: 'Consultar tabela de preços atualizada',
        url: '/v2/orcamento/tabela-preco',
        icons: [{ src: '/pwa-orcamento-192x192.png', sizes: '192x192', type: 'image/png' }],
      },
      {
        name: 'Clientes & CRM',
        short_name: 'Clientes',
        description: 'Ver clientes e agenda de follow-ups',
        url: '/v2/orcamento/clientes',
        icons: [{ src: '/pwa-orcamento-192x192.png', sizes: '192x192', type: 'image/png' }],
      },
    ],
    categories: ['business', 'productivity'],
    lang: 'pt-BR',
    dir: 'ltr',
  }

  res.setHeader('Content-Type', 'application/manifest+json')
  res.setHeader('Cache-Control', 'public, max-age=3600')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.status(200).json(manifest)
}
