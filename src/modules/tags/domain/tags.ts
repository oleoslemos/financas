export const TAMANHO_MAXIMO_TAG = 40
export const MAXIMO_TAGS_POR_REGISTRO = 10

/** Chave de comparação: minúsculo, sem acento, sem "#", espaços colapsados. */
export function normalizarNomeTag(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .replace(/^#+/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/** Nome para exibir: tira "#" inicial e espaços repetidos, preserva maiúsculas e acentos. */
export function limparNomeTag(nome: string): string {
  return nome.trim().replace(/^#+/, '').replace(/\s+/g, ' ').trim()
}

export type TagParseada = { nome: string; nomeNormalizado: string }

/**
 * Lê o texto do campo de tags ("eko'7, bem aviv"), separado por vírgula (ou ponto e vírgula).
 * Ignora vazios e duplicadas (sem diferenciar maiúscula/acento), mantendo a ordem digitada.
 */
export function parsearEntradaTags(entrada: string | string[]): TagParseada[] {
  const partes = Array.isArray(entrada) ? entrada : entrada.split(/[,;]/)
  const vistos = new Set<string>()
  const resultado: TagParseada[] = []

  for (const parte of partes) {
    const nome = limparNomeTag(parte)
    if (!nome) continue
    if (nome.length > TAMANHO_MAXIMO_TAG) {
      throw new Error(`Tag muito longa (máximo ${TAMANHO_MAXIMO_TAG} caracteres): ${nome.slice(0, 20)}…`)
    }
    const nomeNormalizado = normalizarNomeTag(nome)
    if (!nomeNormalizado || vistos.has(nomeNormalizado)) continue
    vistos.add(nomeNormalizado)
    resultado.push({ nome, nomeNormalizado })
  }

  if (resultado.length > MAXIMO_TAGS_POR_REGISTRO) {
    throw new Error(`Máximo de ${MAXIMO_TAGS_POR_REGISTRO} tags por registro`)
  }
  return resultado
}

export type TagExistente = { id: string; nomeNormalizado: string }

/**
 * Separa o que já existe (reaproveita o id) do que precisa ser criado.
 */
export function resolverTags(entrada: string | string[], existentes: TagExistente[]) {
  const porNome = new Map(existentes.map((t) => [t.nomeNormalizado, t.id]))
  const reaproveitar: string[] = []
  const criar: TagParseada[] = []
  for (const tag of parsearEntradaTags(entrada)) {
    const id = porNome.get(tag.nomeNormalizado)
    if (id) reaproveitar.push(id)
    else criar.push(tag)
  }
  return { reaproveitar, criar }
}

export type TipoTag = 'livre' | 'conta_financeira' | 'categoria_despesa'

/**
 * Conta financeira e categoria são tags de um único valor.
 */
export function exigirTagUnica(entrada: string | string[], rotulo: string): TagParseada {
  const tags = parsearEntradaTags(entrada)
  if (tags.length === 0) throw new Error(`Informe ${rotulo}`)
  if (tags.length > 1) throw new Error(`Informe apenas uma tag de ${rotulo}`)
  return tags[0]
}

/** Formata para exibição em chips: "#eko'7". */
export function formatarChip(nome: string): string {
  return `#${limparNomeTag(nome)}`
}
