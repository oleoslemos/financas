import React, { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { getCurrentV2User, logoutV2User } from '../services/v2AuthService'
import { isAdminUser } from '../guards/V2AdminGuard'
import {
  listPriceTables,
  saveStructuredPriceTable,
  V2PriceTable,
} from '../services/v2TabelaPrecoService'
import {
  parseTabelaPdf,
  StructuredPriceDocument,
} from '../services/v2PdfTableParser'
import {
  comparePriceTables,
  PriceTableDiffSummary,
} from '../services/v2PriceTableComparator'
import {
  FileText,
  Upload,
  CheckCircle2,
  AlertCircle,
  Loader2,
  LogOut,
  ShieldCheck,
  Globe,
  X,
  Sparkles,
  Layers,
  Percent,
  TrendingUp,
  TrendingDown,
  PlusCircle,
  Search,
  ChevronDown,
  ChevronUp,
  MinusCircle,
  ArrowRight,
  Database,
  FileCheck,
} from 'lucide-react'

function formatCurrency(val: number | undefined | null): string {
  if (val === undefined || val === null || isNaN(val)) return 'R$ 0,00'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val)
}

// Helper para carregar pdf.js via CDN de forma transparente e leve no navegador
async function loadPdfJs(): Promise<any> {
  if ((window as any).pdfjsLib) {
    return (window as any).pdfjsLib
  }
  return new Promise((resolve, reject) => {
    const existing = document.getElementById('pdfjs-cdn-script')
    if (existing) {
      existing.addEventListener('load', () => resolve((window as any).pdfjsLib))
      existing.addEventListener('error', () => reject(new Error('Erro ao carregar leitor de PDF.')))
      return
    }

    const script = document.createElement('script')
    script.id = 'pdfjs-cdn-script'
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
    script.onload = () => {
      const lib = (window as any).pdfjsLib
      if (lib) {
        lib.GlobalWorkerOptions.workerSrc =
          'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
        resolve(lib)
      } else {
        reject(new Error('Biblioteca PDF não inicializada.'))
      }
    }
    script.onerror = () => reject(new Error('Falha ao carregar leitor de PDF.'))
    document.head.appendChild(script)
  })
}

// Extrai todo o texto contido nas páginas do PDF
async function extractTextFromPdf(file: File, onProgress?: (page: number, total: number) => void): Promise<string> {
  const pdfjs = await loadPdfJs()
  const arrayBuffer = await file.arrayBuffer()
  const loadingTask = pdfjs.getDocument({ data: arrayBuffer })
  const pdf = await loadingTask.promise
  let fullText = ''

  for (let i = 1; i <= pdf.numPages; i++) {
    if (onProgress) onProgress(i, pdf.numPages)
    const page = await pdf.getPage(i)
    const textContent = await page.getTextContent()
    const pageText = textContent.items
      .map((item: any) => item.str)
      .join(' ')
    fullText += pageText + '\n'
  }

  return fullText
}

export function V2AdmPage() {
  const navigate = useNavigate()
  const user = getCurrentV2User()

  useEffect(() => {
    if (!user || !isAdminUser(user.username)) {
      navigate('/v2/login', { replace: true })
    }
  }, [navigate, user])

  const [currentTable, setCurrentTable] = useState<V2PriceTable | null>(null)

  // Estados do fluxo em 2 Etapas
  // 'IDLE': Aguardando seleção do PDF
  // 'VALIDATED': Etapa 1 concluída (dados extraídos e comparativo pronto para revisão)
  // 'APPLIED': Etapa 2 concluída (tabela oficial gravada no banco com sucesso)
  const [step, setStep] = useState<'IDLE' | 'VALIDATED' | 'APPLIED'>('IDLE')
  const [file, setFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [isApplying, setIsApplying] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string>('')
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null)

  // Resultado da leitura e comparativo
  const [structuredData, setStructuredData] = useState<StructuredPriceDocument | null>(null)
  const [diffSummary, setDiffSummary] = useState<PriceTableDiffSummary | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Estados de visualização do comparador
  const [showDiffDetails, setShowDiffDetails] = useState<boolean>(true)
  const [filterTab, setFilterTab] = useState<'TODOS' | 'NOVOS' | 'ALTERADOS' | 'INALTERADOS' | 'REMOVIDOS'>('TODOS')
  const [diffSearch, setDiffSearch] = useState<string>('')

  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // Carregar tabela atual em bemaviv_tabela_preco
  const loadActiveTable = async () => {
    try {
      const tables = await listPriceTables()
      const def = tables.find(t => t.is_default) || tables[0] || null
      setCurrentTable(def)
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    loadActiveTable()
  }, [])

  const handleLogout = () => {
    logoutV2User()
    navigate('/v2/login')
  }

  const handleFileSelect = (selectedFile: File) => {
    if (selectedFile.type !== 'application/pdf' && !selectedFile.name.toLowerCase().endsWith('.pdf')) {
      setErrorMessage('Por favor, selecione um arquivo em formato PDF.')
      return
    }
    setFile(selectedFile)
    setErrorMessage(null)
    setStructuredData(null)
    setDiffSummary(null)
    setStep('IDLE')
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelect(e.dataTransfer.files[0])
    }
  }

  // ── ETAPA 1: Processar e Validar as Informações (sem gravar no banco) ──
  const handleValidatePdf = async () => {
    if (!file) return

    setProcessing(true)
    setErrorMessage(null)
    setStatusMessage('Carregando motor leitor de PDF...')
    setProgress(null)

    try {
      // 1. Extrair texto do arquivo PDF página a página
      setStatusMessage('Lendo páginas do arquivo PDF...')
      const rawText = await extractTextFromPdf(file, (curr, tot) => {
        setProgress({ current: curr, total: tot })
        setStatusMessage(`Lendo página ${curr} de ${tot}...`)
      })

      // 2. Fazer o parse estruturado completo com as matrizes e itens
      setStatusMessage('Estruturando dados das tabelas e regras comerciais...')
      const doc = parseTabelaPdf(rawText, file.name)
      setStructuredData(doc)

      // 3. Gerar o resumo comparativo com a versão anterior ativa
      setStatusMessage('Cruzando com a tabela ativa para validação...')
      const diff = comparePriceTables(currentTable, doc.items_planos, doc.versao)
      setDiffSummary(diff)

      setStep('VALIDATED')
      setStatusMessage('Etapa 1 Concluída! Informações validadas com sucesso. Revise o comparativo antes de aplicar.')
    } catch (err: any) {
      console.error(err)
      setErrorMessage(err.message || 'Erro ao processar o arquivo PDF.')
    } finally {
      setProcessing(false)
    }
  }

  // ── ETAPA 2: Confirmar e Atualizar Tabela de Preço Oficial no Supabase ──
  const handleApplyPriceTable = async () => {
    if (!structuredData) return

    setIsApplying(true)
    setErrorMessage(null)
    setStatusMessage('Gravando nova tabela na base oficial bemaviv_tabela_preco...')

    try {
      await saveStructuredPriceTable(structuredData)
      await loadActiveTable()
      setStep('APPLIED')
      setStatusMessage('Etapa 2 Concluída! Tabela de preços atualizada com sucesso no sistema.')
    } catch (err: any) {
      console.error(err)
      setErrorMessage(err.message || 'Erro ao gravar a tabela de preços no banco de dados.')
    } finally {
      setIsApplying(false)
    }
  }

  const handleReset = () => {
    setFile(null)
    setStructuredData(null)
    setDiffSummary(null)
    setStep('IDLE')
    setIsApplying(false)
    setErrorMessage(null)
    setStatusMessage('')
    setProgress(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // Filtragem dos itens comparados
  const filteredDiffItems = (diffSummary?.itens || []).filter((item) => {
    const matchesTab =
      filterTab === 'TODOS' ||
      (filterTab === 'NOVOS' && item.tipo === 'NOVO') ||
      (filterTab === 'ALTERADOS' && item.tipo === 'ALTERADO') ||
      (filterTab === 'INALTERADOS' && item.tipo === 'INALTERADO') ||
      (filterTab === 'REMOVIDOS' && item.tipo === 'REMOVIDO')

    const q = diffSearch.toLowerCase().trim()
    const matchesSearch =
      !q ||
      item.nome.toLowerCase().includes(q) ||
      item.linha.toLowerCase().includes(q) ||
      (item.sku && item.sku.toLowerCase().includes(q))

    return matchesTab && matchesSearch
  })

  if (!user || !isAdminUser(user.username)) return null

  return (
    <div
      className="min-h-screen font-sans pb-16 flex flex-col justify-between"
      style={{ background: 'linear-gradient(135deg, #090d16 0%, #0f172a 50%, #09131f 100%)' }}
    >
      {/* ── Topbar Simplificada ── */}
      <header className="border-b border-white/10 bg-slate-900/80 backdrop-blur-md sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-indigo-500/20 border border-indigo-400/30 rounded-xl px-3 py-1.5">
              <ShieldCheck className="h-4 w-4 text-indigo-400" />
              <span className="text-xs font-black text-indigo-300 uppercase tracking-widest">ADM</span>
            </div>
            <span className="text-white font-black text-base hidden sm:block">
              Importação de Tabela de Preço
            </span>
          </div>

          <div className="flex items-center gap-2 bg-emerald-950/40 border border-emerald-700/50 rounded-xl px-3 py-1 text-xs font-bold text-emerald-300">
            <Globe className="h-3.5 w-3.5 text-emerald-400" />
            <span className="hidden md:inline">Tabela Global (Multi-Empresa)</span>
            <span className="md:hidden">Global</span>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400 hidden sm:block">
              Acesso: <strong className="text-indigo-300">{user.username}</strong>
            </span>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-400 hover:text-red-400 hover:bg-red-900/30 border border-slate-700 hover:border-red-700/50 transition"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sair
            </button>
          </div>
        </div>
      </header>

      {/* ── Conteúdo Central ── */}
      <main className="max-w-5xl w-full mx-auto px-4 sm:px-6 py-8 flex-1 flex flex-col justify-center">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-black text-white tracking-tight">
            Importar Tabela de Preço
          </h1>
          <p className="text-sm text-slate-400 mt-2 max-w-lg mx-auto">
            Envie o arquivo PDF com a tabela de preços da fábrica. O sistema atualizará diretamente a base global compartilhada por todas as empresas e gerará o resumo comparativo de mudanças.
          </p>
        </div>

        {/* ── Card Principal de Upload de PDF ── */}
        <div className="bg-slate-900/80 border border-slate-700/80 rounded-3xl p-6 sm:p-10 shadow-2xl backdrop-blur-xl relative overflow-hidden">
          {/* Stepper das 2 Etapas */}
          <div className="mb-8 p-3 rounded-2xl bg-slate-950/60 border border-slate-800 flex items-center justify-between sm:justify-center gap-4 text-xs font-bold">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl transition ${
              step === 'IDLE' ? 'bg-indigo-950 border border-indigo-700/60 text-indigo-300' : 'bg-emerald-950/60 text-emerald-400 border border-emerald-700/50'
            }`}>
              <div className={`h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-black ${
                step === 'IDLE' ? 'bg-indigo-600 text-white' : 'bg-emerald-600 text-white'
              }`}>
                {step === 'IDLE' ? '1' : '✓'}
              </div>
              <span>1. Importar e Validar</span>
            </div>

            <ArrowRight className="h-4 w-4 text-slate-600 shrink-0" />

            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl transition ${
              step === 'APPLIED'
                ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-700/50'
                : step === 'VALIDATED'
                ? 'bg-amber-950/60 text-amber-300 border border-amber-600 animate-pulse'
                : 'text-slate-500'
            }`}>
              <div className={`h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-black ${
                step === 'APPLIED' ? 'bg-emerald-600 text-white' : step === 'VALIDATED' ? 'bg-amber-500 text-slate-950 font-black' : 'bg-slate-800 text-slate-400'
              }`}>
                {step === 'APPLIED' ? '✓' : '2'}
              </div>
              <span>2. Atualizar Tabela de Preço</span>
            </div>
          </div>

          {/* Status da Tabela Atual */}
          {currentTable && (
            <div className="mb-6 pb-6 border-b border-slate-800 flex items-center justify-between flex-wrap gap-2 text-xs">
              <span className="text-slate-400 font-medium">
                Tabela ativa no sistema: <strong className="text-white">{currentTable.name}</strong>
              </span>
              <span className="text-indigo-400 font-semibold bg-indigo-950/60 border border-indigo-800/60 px-2.5 py-1 rounded-lg">
                {currentTable.items?.length || 0} produtos cadastrados
              </span>
            </div>
          )}

          {/* Área de Dropzone / Seleção de Arquivo */}
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => !file && fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-8 sm:p-12 text-center transition cursor-pointer flex flex-col items-center justify-center ${
              isDragging
                ? 'border-indigo-400 bg-indigo-950/20'
                : file
                ? step === 'APPLIED'
                  ? 'border-emerald-500/50 bg-emerald-950/10'
                  : 'border-indigo-500/50 bg-indigo-950/10'
                : 'border-slate-700 hover:border-indigo-500/50 hover:bg-slate-800/40'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,application/pdf"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  handleFileSelect(e.target.files[0])
                }
              }}
            />

            {!file ? (
              <>
                <div className="h-16 w-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-4 text-indigo-400">
                  <FileText className="h-8 w-8" />
                </div>
                <h3 className="text-lg font-bold text-white">
                  Selecione ou arraste seu arquivo PDF
                </h3>
                <p className="text-xs text-slate-400 mt-1 max-w-sm">
                  Formatos aceitos: arquivos <strong>.PDF</strong> com tabela de preços de fábrica.
                </p>
                <button
                  type="button"
                  className="mt-6 px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 transition shadow-lg shadow-indigo-600/30 flex items-center gap-2"
                >
                  <Upload className="h-4 w-4" />
                  Escolher Arquivo PDF
                </button>
              </>
            ) : (
              <div className="w-full">
                <div className="flex items-center justify-between bg-slate-800/80 border border-slate-700 p-4 rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-red-500/20 text-red-400 flex items-center justify-center">
                      <FileText className="h-5 w-5" />
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-bold text-white">{file.name}</p>
                      <p className="text-xs text-slate-400">
                        {(file.size / 1024).toFixed(1)} KB · Arquivo PDF
                      </p>
                    </div>
                  </div>
                  {!processing && !isApplying && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleReset()
                      }}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition"
                      title="Remover arquivo"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>

                {/* Mensagem de progresso de validação ou gravação */}
                {(processing || isApplying) && (
                  <div className="mt-6 space-y-2">
                    <div className="flex items-center justify-center gap-2 text-indigo-400 text-sm font-bold">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>{statusMessage}</span>
                    </div>
                    {progress && (
                      <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden mt-2">
                        <div
                          className="bg-indigo-500 h-full transition-all duration-300"
                          style={{ width: `${(progress.current / progress.total) * 100}%` }}
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Botão da Etapa 1: Processar e Validar */}
                {!processing && !isApplying && step === 'IDLE' && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleValidatePdf()
                    }}
                    className="mt-6 w-full py-3.5 rounded-xl text-sm font-bold text-white transition flex items-center justify-center gap-2 shadow-xl shadow-indigo-600/30 cursor-pointer"
                    style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
                  >
                    <FileCheck className="h-4 w-4" />
                    1. Importar e Validar Informações
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Feedback de Erro */}
          {errorMessage && (
            <div className="mt-6 p-4 rounded-xl bg-red-950/40 border border-red-800/60 flex items-center gap-3 text-red-300 text-xs font-semibold">
              <AlertCircle className="h-5 w-5 text-red-400 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* ── PAINEL DA ETAPA 2 (QUANDO OS DADOS FORAM VALIDADOS) ── */}
          {step === 'VALIDATED' && structuredData && diffSummary && (
            <div className="mt-6 p-6 rounded-2xl bg-gradient-to-r from-indigo-950/80 via-slate-900 to-emerald-950/80 border-2 border-indigo-500/70 shadow-2xl flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="space-y-1 text-center md:text-left">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Etapa 1 Concluída · Dados Validados
                </div>
                <h4 className="text-base font-black text-white">
                  Pronto para atualizar a tabela oficial de preço?
                </h4>
                <p className="text-xs text-slate-300 max-w-xl">
                  Revise abaixo o resumo comparativo com todas as inclusões e reajustes. Ao confirmar, o sistema atualizará a base global com <strong>{structuredData.items_planos.length} produtos</strong> da versão <strong>{structuredData.versao}</strong>.
                </p>
              </div>

              <div className="flex items-center gap-3 w-full md:w-auto shrink-0">
                <button
                  type="button"
                  onClick={handleReset}
                  disabled={isApplying}
                  className="flex-1 md:flex-none px-4 py-3 rounded-xl text-xs font-bold text-slate-400 hover:text-white bg-slate-800/90 hover:bg-slate-700 border border-slate-700 transition"
                >
                  Descartar
                </button>
                <button
                  type="button"
                  onClick={handleApplyPriceTable}
                  disabled={isApplying}
                  className="flex-1 md:flex-none px-6 py-3 rounded-xl text-xs font-black text-white transition flex items-center justify-center gap-2 shadow-xl shadow-emerald-600/30 cursor-pointer"
                  style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
                >
                  {isApplying ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Atualizando...
                    </>
                  ) : (
                    <>
                      <Database className="h-4 w-4" />
                      2. Atualizar Tabela de Preço
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* ── BANNER DE CONCLUSÃO FINAL DA ETAPA 2 ── */}
          {step === 'APPLIED' && (
            <div className="mt-6 p-6 rounded-2xl bg-emerald-950/60 border border-emerald-600 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3 text-emerald-300 font-black text-base text-center sm:text-left">
                <CheckCircle2 className="h-7 w-7 text-emerald-400 shrink-0" />
                <div>
                  <div>Tabela de Preço Atualizada com Sucesso!</div>
                  <div className="text-xs font-normal text-emerald-200 mt-0.5">
                    A versão <strong>{structuredData?.versao}</strong> agora é a tabela padrão oficial compartilhada entre todas as empresas.
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={handleReset}
                className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-slate-800 hover:bg-slate-700 border border-slate-600 transition shrink-0"
              >
                Concluir / Importar Outro PDF
              </button>
            </div>
          )}

          {/* Feedback de Sucesso & Resumo Comparativo */}
          {(step === 'VALIDATED' || step === 'APPLIED') && structuredData && diffSummary && (
            <div className="mt-6 space-y-6 animate-in fade-in">
              <div className="p-6 rounded-2xl bg-slate-800/60 border border-slate-700/80 space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2 text-white font-black text-sm">
                    <Sparkles className="h-4 w-4 text-amber-400" />
                    <span>Dados Estruturados da Tabela</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="bg-slate-900/80 border border-slate-700/80 p-3 rounded-xl">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                      Versão Identificada
                    </span>
                    <div className="flex items-center gap-1.5 text-white font-black text-sm">
                      <Sparkles className="h-4 w-4 text-amber-400" />
                      {structuredData.versao}
                    </div>
                  </div>

                  <div className="bg-slate-900/80 border border-slate-700/80 p-3 rounded-xl">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                      Produtos Catalogados
                    </span>
                    <div className="flex items-center gap-1.5 text-emerald-300 font-black text-sm">
                      <Layers className="h-4 w-4 text-emerald-400" />
                      {structuredData.items_planos.length} itens prontos
                    </div>
                  </div>

                  <div className="bg-slate-900/80 border border-slate-700/80 p-3 rounded-xl">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                      Condições Comerciais
                    </span>
                    <div className="flex items-center gap-1.5 text-indigo-300 font-black text-xs">
                      <Percent className="h-3.5 w-3.5 text-indigo-400" />
                      -5% em 5x · -5%-5% à vista
                    </div>
                  </div>
                </div>
              </div>

              {/* ── CARD RESUMO COMPARATIVO (O que mudou) ── */}
              <div className="p-6 rounded-2xl bg-slate-800/90 border border-slate-700 space-y-5">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <h3 className="text-base font-black text-white flex items-center gap-2">
                      <Layers className="h-4 w-4 text-indigo-400" />
                      Resumo Comparativo de Mudanças
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Comparação entre <strong>{diffSummary.versaoAnterior}</strong> e <strong>{diffSummary.versaoNova}</strong>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowDiffDetails(!showDiffDetails)}
                    className="flex items-center gap-1.5 text-xs font-bold text-indigo-300 hover:text-indigo-200 transition bg-indigo-950/60 px-3 py-1.5 rounded-lg border border-indigo-800/60"
                  >
                    {showDiffDetails ? (
                      <>
                        <ChevronUp className="h-3.5 w-3.5" /> Ocultar Tabela
                      </>
                    ) : (
                      <>
                        <ChevronDown className="h-3.5 w-3.5" /> Ver Detalhes ({diffSummary.itens.length})
                      </>
                    )}
                  </button>
                </div>

                {/* 4 Cards de Estatísticas do Diff */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div
                    onClick={() => setFilterTab('NOVOS')}
                    className={`p-3.5 rounded-xl border cursor-pointer transition ${
                      filterTab === 'NOVOS'
                        ? 'bg-emerald-950/60 border-emerald-500'
                        : 'bg-slate-900/60 border-slate-700/60 hover:border-emerald-600/50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-slate-400 uppercase">Novos Itens</span>
                      <PlusCircle className="h-4 w-4 text-emerald-400" />
                    </div>
                    <span className="text-2xl font-black text-emerald-300 block mt-1">
                      {diffSummary.totalNovos}
                    </span>
                  </div>

                  <div
                    onClick={() => setFilterTab('ALTERADOS')}
                    className={`p-3.5 rounded-xl border cursor-pointer transition ${
                      filterTab === 'ALTERADOS'
                        ? 'bg-indigo-950/60 border-indigo-500'
                        : 'bg-slate-900/60 border-slate-700/60 hover:border-indigo-600/50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-slate-400 uppercase">Preço Alterado</span>
                      <TrendingUp className="h-4 w-4 text-indigo-400" />
                    </div>
                    <span className="text-2xl font-black text-indigo-300 block mt-1">
                      {diffSummary.totalAlterados}
                    </span>
                  </div>

                  <div
                    onClick={() => setFilterTab('INALTERADOS')}
                    className={`p-3.5 rounded-xl border cursor-pointer transition ${
                      filterTab === 'INALTERADOS'
                        ? 'bg-slate-800 border-slate-500'
                        : 'bg-slate-900/60 border-slate-700/60 hover:border-slate-500'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-slate-400 uppercase">Inalterados</span>
                      <CheckCircle2 className="h-4 w-4 text-slate-400" />
                    </div>
                    <span className="text-2xl font-black text-slate-300 block mt-1">
                      {diffSummary.totalInalterados}
                    </span>
                  </div>

                  <div
                    onClick={() => setFilterTab('REMOVIDOS')}
                    className={`p-3.5 rounded-xl border cursor-pointer transition ${
                      filterTab === 'REMOVIDOS'
                        ? 'bg-amber-950/60 border-amber-500'
                        : 'bg-slate-900/60 border-slate-700/60 hover:border-amber-600/50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-slate-400 uppercase">Ausentes</span>
                      <MinusCircle className="h-4 w-4 text-amber-400" />
                    </div>
                    <span className="text-2xl font-black text-amber-300 block mt-1">
                      {diffSummary.totalRemovidos}
                    </span>
                  </div>
                </div>

                {/* Tabela de Detalhes do Comparativo */}
                {showDiffDetails && (
                  <div className="space-y-3 pt-2 border-t border-slate-700/80">
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                      {/* Filtro Tabs */}
                      <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
                        {(['TODOS', 'NOVOS', 'ALTERADOS', 'INALTERADOS', 'REMOVIDOS'] as const).map((tab) => (
                          <button
                            key={tab}
                            type="button"
                            onClick={() => setFilterTab(tab)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap ${
                              filterTab === tab
                                ? 'bg-indigo-600 text-white'
                                : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-700'
                            }`}
                          >
                            {tab === 'TODOS'
                              ? `Todos (${diffSummary.itens.length})`
                              : tab === 'NOVOS'
                              ? `Novos (${diffSummary.totalNovos})`
                              : tab === 'ALTERADOS'
                              ? `Alterados (${diffSummary.totalAlterados})`
                              : tab === 'INALTERADOS'
                              ? `Inalterados (${diffSummary.totalInalterados})`
                              : `Ausentes (${diffSummary.totalRemovidos})`}
                          </button>
                        ))}
                      </div>

                      {/* Busca */}
                      <div className="relative w-full sm:w-64">
                        <Search className="h-3.5 w-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          placeholder="Buscar produto ou linha..."
                          value={diffSearch}
                          onChange={(e) => setDiffSearch(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 outline-none focus:border-indigo-500"
                        />
                      </div>
                    </div>

                    {/* Lista / Tabela com estilização explícita escura (evita override global de td do index.css) */}
                    <div className="max-h-96 overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 shadow-inner">
                      <table className="w-full text-left text-xs border-collapse" style={{ backgroundColor: '#0f172a' }}>
                        <thead className="sticky top-0 z-10 text-slate-300 font-bold uppercase tracking-wider text-[11px]" style={{ backgroundColor: '#1e293b' }}>
                          <tr>
                            <th className="p-3" style={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#94a3b8' }}>Status</th>
                            <th className="p-3" style={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#94a3b8' }}>Produto</th>
                            <th className="p-3" style={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#94a3b8' }}>Linha</th>
                            <th className="p-3 text-right" style={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#94a3b8' }}>Preço Anterior</th>
                            <th className="p-3 text-right" style={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#94a3b8' }}>Novo Preço</th>
                            <th className="p-3 text-right" style={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#94a3b8' }}>Variação</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                          {filteredDiffItems.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="p-8 text-center text-slate-500 font-semibold" style={{ backgroundColor: '#0f172a', borderColor: '#1e293b' }}>
                                Nenhum produto encontrado para este filtro.
                              </td>
                            </tr>
                          ) : (
                            filteredDiffItems.map((item, idx) => (
                              <tr key={idx} className="transition" style={{ backgroundColor: idx % 2 === 0 ? '#0f172a' : '#141e33' }}>
                                <td className="p-3 whitespace-nowrap" style={{ backgroundColor: 'inherit', borderColor: '#1e293b' }}>
                                  {item.tipo === 'NOVO' && (
                                    <span className="px-2 py-0.5 rounded text-[10px] font-black bg-emerald-950 text-emerald-400 border border-emerald-700/50">
                                      NOVO
                                    </span>
                                  )}
                                  {item.tipo === 'ALTERADO' && (
                                    <span
                                      className={`px-2 py-0.5 rounded text-[10px] font-black border ${
                                        item.detalheMudanca
                                          ? 'bg-amber-950 text-amber-300 border-amber-700/50'
                                          : (item.diferenca || 0) > 0
                                          ? 'bg-indigo-950 text-indigo-400 border-indigo-700/50'
                                          : 'bg-teal-950 text-teal-400 border-teal-700/50'
                                      }`}
                                    >
                                      {item.detalheMudanca ? 'ESPECIFICAÇÃO' : (item.diferenca || 0) > 0 ? 'REAJUSTE' : 'REDUÇÃO'}
                                    </span>
                                  )}
                                  {item.tipo === 'INALTERADO' && (
                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700">
                                      MANTIDO
                                    </span>
                                  )}
                                  {item.tipo === 'REMOVIDO' && (
                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-950 text-rose-400 border border-rose-800/50">
                                      AUSENTE
                                    </span>
                                  )}
                                </td>
                                <td className="p-3 font-bold text-white max-w-sm" style={{ backgroundColor: 'inherit', borderColor: '#1e293b' }}>
                                  <div className="text-white text-xs leading-5">{item.nome}</div>
                                  {item.detalheMudanca && (
                                    <div className="mt-1 inline-flex items-center gap-1 text-[10px] font-black text-amber-300 bg-amber-950/70 px-2 py-0.5 rounded border border-amber-800/60">
                                      <span>📐 {item.detalheMudanca}</span>
                                    </div>
                                  )}
                                </td>
                                <td className="p-3 text-slate-400 whitespace-nowrap text-xs" style={{ backgroundColor: 'inherit', borderColor: '#1e293b' }}>
                                  {item.linha}
                                </td>
                                <td className="p-3 text-right text-slate-400 whitespace-nowrap text-xs" style={{ backgroundColor: 'inherit', borderColor: '#1e293b' }}>
                                  {item.precoAnterior !== undefined ? formatCurrency(item.precoAnterior) : '—'}
                                </td>
                                <td className="p-3 text-right font-black text-white whitespace-nowrap text-xs" style={{ backgroundColor: 'inherit', borderColor: '#1e293b' }}>
                                  {item.precoNovo !== undefined ? formatCurrency(item.precoNovo) : '—'}
                                </td>
                                <td className="p-3 text-right whitespace-nowrap text-xs" style={{ backgroundColor: 'inherit', borderColor: '#1e293b' }}>
                                  {item.tipo === 'ALTERADO' && item.diferenca !== undefined ? (
                                    <div className="flex flex-col items-end gap-0.5 font-bold">
                                      <div className="flex items-center gap-1">
                                        {item.diferenca > 0 ? (
                                          <TrendingUp className="h-3 w-3 text-indigo-400" />
                                        ) : item.diferenca < 0 ? (
                                          <TrendingDown className="h-3 w-3 text-teal-400" />
                                        ) : null}
                                        <span className={item.diferenca > 0 ? 'text-indigo-400 font-black' : item.diferenca < 0 ? 'text-teal-400 font-black' : 'text-slate-400'}>
                                          {item.diferenca > 0 ? '+' : ''}
                                          {item.variacaoPercentual}%
                                        </span>
                                      </div>
                                      <span className="text-[10px] text-slate-500 font-medium">
                                        {item.diferenca > 0 ? '+' : ''}
                                        {formatCurrency(item.diferenca)}
                                      </span>
                                    </div>
                                  ) : item.tipo === 'NOVO' ? (
                                    <span className="text-emerald-400 font-bold text-[11px]">+ Inclusão</span>
                                  ) : (
                                    <span className="text-slate-600">0%</span>
                                  )}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* ── Rodapé Minimalista ── */}
      <footer className="text-center text-xs text-slate-600 py-4">
        Painel de Administração · Bem Aviv Global · Acesso Restrito
      </footer>
    </div>
  )
}
