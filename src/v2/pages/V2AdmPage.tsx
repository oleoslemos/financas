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
} from 'lucide-react'

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

  // Estados do upload do PDF
  const [file, setFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string>('')
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null)

  // Resultado da leitura
  const [structuredData, setStructuredData] = useState<StructuredPriceDocument | null>(null)
  const [importSuccess, setImportSuccess] = useState<boolean>(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

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
    setImportSuccess(false)
    setStructuredData(null)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelect(e.dataTransfer.files[0])
    }
  }

  // Processamento do PDF e gravação na tabela bemaviv_tabela_preco
  const handleProcessPdf = async () => {
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

      // 3. Salvar diretamente na tabela global bemaviv_tabela_preco
      setStatusMessage('Gravando na base de dados bemaviv_tabela_preco...')
      await saveStructuredPriceTable(doc)

      await loadActiveTable()
      setImportSuccess(true)
      setStatusMessage('Importação concluída com sucesso!')
    } catch (err: any) {
      console.error(err)
      setErrorMessage(err.message || 'Erro ao processar o arquivo PDF.')
    } finally {
      setProcessing(false)
    }
  }

  const handleReset = () => {
    setFile(null)
    setStructuredData(null)
    setImportSuccess(false)
    setErrorMessage(null)
    setStatusMessage('')
    setProgress(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  if (!user || !isAdminUser(user.username)) return null

  return (
    <div
      className="min-h-screen font-sans pb-16 flex flex-col justify-between"
      style={{ background: 'linear-gradient(135deg, #090d16 0%, #0f172a 50%, #09131f 100%)' }}
    >
      {/* ── Topbar Simplificada ── */}
      <header className="border-b border-white/10 bg-slate-900/80 backdrop-blur-md sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between gap-4">
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
      <main className="max-w-3xl w-full mx-auto px-4 sm:px-6 py-10 flex-1 flex flex-col justify-center">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-black text-white tracking-tight">
            Importar Tabela de Preço
          </h1>
          <p className="text-sm text-slate-400 mt-2 max-w-lg mx-auto">
            Envie o arquivo PDF com a tabela de preços da fábrica. O sistema atualizará diretamente a base global compartilhada por todas as empresas.
          </p>
        </div>

        {/* ── Card Principal de Upload de PDF ── */}
        <div className="bg-slate-900/80 border border-slate-700/80 rounded-3xl p-6 sm:p-10 shadow-2xl backdrop-blur-xl relative overflow-hidden">
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
                ? 'border-emerald-500/50 bg-emerald-950/10'
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
                  {!processing && (
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

                {/* Mensagem de progresso */}
                {processing && (
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

                {/* Botão de ação de processamento */}
                {!processing && !importSuccess && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleProcessPdf()
                    }}
                    className="mt-6 w-full py-3.5 rounded-xl text-sm font-bold text-white transition flex items-center justify-center gap-2 shadow-xl shadow-indigo-600/30 cursor-pointer"
                    style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
                  >
                    <Upload className="h-4 w-4" />
                    Processar e Importar PDF
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

          {/* Feedback de Sucesso */}
          {importSuccess && structuredData && (
            <div className="mt-6 p-6 rounded-2xl bg-emerald-950/40 border border-emerald-700/50 space-y-4 animate-in fade-in">
              <div className="flex items-center gap-3 text-emerald-300 font-black text-base">
                <CheckCircle2 className="h-6 w-6 text-emerald-400 shrink-0" />
                <span>Arquivo PDF importado e estruturado com sucesso!</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-slate-900/80 border border-emerald-900/50 p-3 rounded-xl">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                    Versão Identificada
                  </span>
                  <div className="flex items-center gap-1.5 text-white font-black text-sm">
                    <Sparkles className="h-4 w-4 text-amber-400" />
                    {structuredData.versao}
                  </div>
                </div>

                <div className="bg-slate-900/80 border border-emerald-900/50 p-3 rounded-xl">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                    Produtos Catalogados
                  </span>
                  <div className="flex items-center gap-1.5 text-emerald-300 font-black text-sm">
                    <Layers className="h-4 w-4 text-emerald-400" />
                    {structuredData.items_planos.length} itens prontos
                  </div>
                </div>

                <div className="bg-slate-900/80 border border-emerald-900/50 p-3 rounded-xl">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                    Condições Comerciais
                  </span>
                  <div className="flex items-center gap-1.5 text-indigo-300 font-black text-xs">
                    <Percent className="h-3.5 w-3.5 text-indigo-400" />
                    -5% em 5x · -5%-5% à vista
                  </div>
                </div>
              </div>

              <p className="text-xs text-slate-300">
                A tabela <strong>bemaviv_tabela_preco</strong> foi atualizada na nuvem com todas as matrizes dimensionais e itens disponíveis para todas as empresas.
              </p>

              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={handleReset}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-slate-800 hover:bg-slate-700 border border-slate-600 transition"
                >
                  Importar Outro PDF
                </button>
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
