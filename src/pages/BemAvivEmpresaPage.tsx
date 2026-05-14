import { useEffect, useState } from 'react'
import { useSupabase } from '../hooks/useSupabase'
import { useCompany } from '../context/CompanyContext'
import { Button } from '../components/ui/Button'

export function BemAvivEmpresaPage() {
  const supabase = useSupabase()
  const {
    activeCompany,
    activeCompanyId,
    loading: companyLoading,
    error: companyError,
    refreshCompanies,
  } = useCompany()
  const [tradeName, setTradeName] = useState('')
  const [legalName, setLegalName] = useState('')
  const [taxId, setTaxId] = useState('')
  const [phone, setPhone] = useState('')
  const [emailContact, setEmailContact] = useState('')
  const [addressStreet, setAddressStreet] = useState('')
  const [addressCity, setAddressCity] = useState('')
  const [addressState, setAddressState] = useState('')
  const [zipCode, setZipCode] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)

  useEffect(() => {
    if (!activeCompany) return
    setTradeName(activeCompany.trade_name ?? '')
    setLegalName(activeCompany.legal_name ?? '')
    setTaxId(activeCompany.tax_id ?? '')
    setPhone(activeCompany.phone ?? '')
    setEmailContact(activeCompany.email_contact ?? '')
    setAddressStreet(activeCompany.address_street ?? '')
    setAddressCity(activeCompany.address_city ?? '')
    setAddressState(activeCompany.address_state ?? '')
    setZipCode(activeCompany.zip_code ?? '')
  }, [activeCompany])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase || !activeCompanyId) return
    setSaving(true)
    setSaveMsg(null)
    const { error } = await supabase
      .from('companies')
      .update({
        trade_name: tradeName.trim() || activeCompany?.trade_name,
        legal_name: legalName.trim() || null,
        tax_id: taxId.trim() || null,
        phone: phone.trim() || null,
        email_contact: emailContact.trim() || null,
        address_street: addressStreet.trim() || null,
        address_city: addressCity.trim() || null,
        address_state: addressState.trim() || null,
        zip_code: zipCode.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', activeCompanyId)
    setSaving(false)
    if (error) setSaveMsg(error.message)
    else {
      setSaveMsg('Dados salvos.')
      await refreshCompanies()
    }
  }

  if (companyLoading) {
    return <p className="text-sm text-slate-600">Carregando empresas…</p>
  }
  if (companyError) {
    return (
      <div className="space-y-3 rounded-lg border border-rose-200 bg-rose-50/80 p-4 text-sm text-rose-900">
        <p>
          <span className="font-semibold">Erro ao carregar vínculos:</span> {companyError}
        </p>
        <Button type="button" variant="secondary" onClick={() => void refreshCompanies()}>
          Tentar novamente
        </Button>
      </div>
    )
  }
  if (!activeCompanyId || !activeCompany) {
    return <p className="text-sm text-slate-600">Nenhuma empresa disponível para esta conta.</p>
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Dados da empresa</h1>
        <p className="mt-1 text-sm text-slate-600">
          Cadastro básico da empresa ativa ({activeCompany.slug}). Valores iniciais são fictícios e podem ser editados.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <label className="block space-y-1">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Nome fantasia</span>
          <input
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
            value={tradeName}
            onChange={(e) => setTradeName(e.target.value)}
            required
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Razão social</span>
          <input
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
            value={legalName}
            onChange={(e) => setLegalName(e.target.value)}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">CNPJ / documento</span>
          <input
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
            value={taxId}
            onChange={(e) => setTaxId(e.target.value)}
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Telefone</span>
            <input
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">E-mail de contato</span>
            <input
              type="email"
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
              value={emailContact}
              onChange={(e) => setEmailContact(e.target.value)}
            />
          </label>
        </div>
        <label className="block space-y-1">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Endereço (logradouro)</span>
          <input
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
            value={addressStreet}
            onChange={(e) => setAddressStreet(e.target.value)}
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block space-y-1 sm:col-span-1">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Cidade</span>
            <input
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
              value={addressCity}
              onChange={(e) => setAddressCity(e.target.value)}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">UF</span>
            <input
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
              value={addressState}
              onChange={(e) => setAddressState(e.target.value)}
              maxLength={2}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">CEP</span>
            <input
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
              value={zipCode}
              onChange={(e) => setZipCode(e.target.value)}
            />
          </label>
        </div>
        {saveMsg ? <p className="text-sm text-slate-700">{saveMsg}</p> : null}
        <div className="flex justify-end pt-2">
          <Button type="submit" disabled={saving}>
            {saving ? 'Salvando…' : 'Salvar'}
          </Button>
        </div>
      </form>
    </div>
  )
}
