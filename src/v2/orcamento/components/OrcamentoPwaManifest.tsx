/**
 * OrcamentoPwaManifest
 *
 * Injeta dinamicamente o manifest PWA dedicado ao módulo Orçamento Mobile
 * quando o usuário está em qualquer rota /v2/orcamento/*.
 *
 * Isso permite que o navegador ofereça a instalação do app "Orçamento Mobile"
 * como um PWA separado, com ícone verde, start_url e nome próprios —
 * independente do manifest principal do Bem Aviv Hub.
 *
 * Como funciona:
 *  1. O componente encontra (ou cria) o <link rel="manifest"> no <head>.
 *  2. Aponta para /api/orcamento-manifest que serve um manifest dedicado.
 *  3. Ao desmontar, restaura o manifest original (/manifest.webmanifest).
 */
import { useEffect } from 'react'

const ORIGINAL_MANIFEST = '/manifest.webmanifest'
const ORCAMENTO_MANIFEST = '/api/orcamento-manifest'

export function OrcamentoPwaManifest() {
  useEffect(() => {
    // Encontra ou cria o elemento <link rel="manifest">
    let link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')

    if (!link) {
      link = document.createElement('link')
      link.rel = 'manifest'
      document.head.appendChild(link)
    }

    // Troca para o manifest do Orçamento
    link.href = ORCAMENTO_MANIFEST

    // Atualiza theme-color para verde
    let themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    const prevTheme = themeColor?.content ?? '#0F3764'

    if (!themeColor) {
      themeColor = document.createElement('meta')
      themeColor.name = 'theme-color'
      document.head.appendChild(themeColor)
    }
    themeColor.content = '#7DC344'

    // Atualiza o título da página
    const prevTitle = document.title
    document.title = 'Orçamento Mobile — Bem Aviv'

    // Restaura ao desmontar (quando sai do módulo de orçamento)
    return () => {
      if (link) link.href = ORIGINAL_MANIFEST
      if (themeColor) themeColor.content = prevTheme
      document.title = prevTitle
    }
  }, [])

  return null
}
