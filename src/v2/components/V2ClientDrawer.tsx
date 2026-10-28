import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  X,
  MessageCircle,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Save,
  Trash2,
  Users,
  Pencil,
  UserPlus,
} from 'lucide-react'
import {
  BemAvivClient,
  BemAvivClientInput,
  ClientOrderRow,
  Familiar,
  computeOrderStats,
  createClient,
  createClientFromRelative,
  createRelative,
  deleteClient,
  deleteRelative,
  extractBaseClientName,
  fetchClientOrdersResult,
  fetchRelativesResult,
  formatClientWithSpouseName,
  formatPhone,
  toClientPayload,
  updateClient,
  updateRelative,
} from '../services/v2ClientesService'
import { V2ClientFollowupSheet } from './V2ClientFollowupSheet'

export interface ClientDrawerProps {
  open: boolean
  client: BemAvivClient | null // null = new
  companyId: string | null
  onClose: () => void
  onSaved: (c: BemAvivClient) => void
  onDeleted?: (id: string) => void
  onOpenClient?: (clientId: string) => void
  onClientCreated?: (c: BemAvivClient) => void
}

export type DrawerTab = 'dados' | 'contato' | 'familiares' | 'followup' | 'pedidos'

function formatDate(iso: string | null | undefined): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  } catch {
    return iso
  }
}

function formatDateInput(iso: string | null | undefined): string {
  if (!iso) return ''
  return iso.split('T')[0].split(' ')[0]
}

function getWhatsappUrl(phone?: string | null): string | null {
  if (!phone) return null
  const d = phone.replace(/\D/g, '')
  if (!d || d.length < 8) return null
  const normalized = d.startsWith('55') ? d : `55${d}`
  return `https://wa.me/${normalized}`
}

function emptyForm(companyId: string | null): Partial<BemAvivClient> {
  return {
    company_id: companyId ?? undefined,
    full_name: '',
    cpf: '',
    birth_date: null,
    phone_1: '',
    phone_2: '',
    email: '',
    cep: '',
    address_street: '',
    address_number: '',
    address_complement: '',
    address_district: '',
    address_city: '',
    address_state: '',
    commercial_stage: 'CONTATO',
    next_followup_at: null,
    next_followup_note: '',
    eko7_presentation_at: null,
    group_reference: '',
  }
}

export function V2ClientDrawer({
  open,
  client,
  companyId,
  onClose,
  onSaved,
  onDeleted,
  onOpenClient,
  onClientCreated,
}: ClientDrawerProps) {
  const [form, setForm] = useState<Partial<BemAvivClient>>(emptyForm(companyId))
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [tab, setTab] = useState<DrawerTab>('dados')

  // Relatives state
  const [relatives, setRelatives] = useState<Familiar[]>([])
  const [loadingRelatives, setLoadingRelatives] = useState(false)
  const [editingRelativeId, setEditingRelativeId] = useState<string | null>(null)
  const [autoCreateClient, setAutoCreateClient] = useState(true)
  const [creatingClientForRelId, setCreatingClientForRelId] = useState<string | null>(null)
  const [newRelative, setNewRelative] = useState({
    name: '',
    relationship: 'CÔNJUGE',
    cpf: '',
    birth_date: '',
    phone: '',
  })
  const [addingRelative, setAddingRelative] = useState(false)

  // Orders state
  const [orders, setOrders] = useState<ClientOrderRow[]>([])
  const [loadingOrders, setLoadingOrders] = useState(false)

  const overlayRef = useRef<HTMLDivElement>(null)
  const prevClientIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!open) {
      prevClientIdRef.current = null
      return
    }

    const isDifferentClient = client?.id !== prevClientIdRef.current
    prevClientIdRef.current = client?.id || null

    if (isDifferentClient) {
      setForm(client ? { ...client } : emptyForm(companyId))
      setTab('dados')
      setEditingRelativeId(null)
      setNewRelative({ name: '', relationship: 'CÔNJUGE', cpf: '', birth_date: '', phone: '' })
    } else if (client) {
      setForm((prev) => ({ ...prev, ...client }))
    }

    setError(null)
    setSuccessMsg(null)

    let cancelled = false

    if (client?.id) {
      if (isDifferentClient) {
        setLoadingRelatives(true)
        setLoadingOrders(true)
      }
      fetchRelativesResult(client.id, companyId).then(({ data, error: err }) => {
        if (cancelled) return
        setRelatives(data)
        setLoadingRelatives(false)
        if (err) setError(`Não foi possível carregar os familiares: ${err}`)

        const sp = data.find((r) =>
          ['CÔNJUGE', 'CONJUGE', 'ESPOSO', 'ESPOSA'].includes((r.relationship || '').toUpperCase())
        )
        if (sp && client?.full_name) {
          const expected = formatClientWithSpouseName(client.full_name, sp.name)
          if (expected && expected !== client.full_name) {
            updateClient(client.id, { full_name: expected }, companyId).then(({ data: updated }) => {
              if (updated && !cancelled) {
                setForm((prev) => ({ ...prev, full_name: updated.full_name }))
                onSaved(updated)
              }
            })
          }
        }
      })

      fetchClientOrdersResult(client.id, companyId).then(({ data, error: err }) => {
        if (cancelled) return
        setOrders(data)
        setLoadingOrders(false)
        if (err) setError(`Não foi possível carregar os pedidos: ${err}`)
      })
    } else {
      setRelatives([])
      setOrders([])
    }

    return () => {
      cancelled = true
    }
  }, [open, client, companyId])

  const set = (key: keyof BemAvivClient, value: unknown) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const handleSave = async () => {
    if (!form.full_name?.trim()) {
      setError('Nome completo é obrigatório.')
      return
    }
    setSaving(true)
    setError(null)
    setSuccessMsg(null)

    // Só campos editáveis; '' vira null; client_status e follow-up ficam de fora.
    const payload = toClientPayload(form, companyId)

    const spouseRel = relatives.find((r) =>
      ['CÔNJUGE', 'CONJUGE', 'ESPOSO', 'ESPOSA'].includes((r.relationship || '').toUpperCase())
    )
    if (spouseRel && payload.full_name) {
      const formatted = formatClientWithSpouseName(payload.full_name, spouseRel.name)
      payload.full_name = formatted
      form.full_name = formatted
    }

    if (client?.id) {
      const { data, error: err } = await updateClient(client.id, payload, companyId)
      setSaving(false)
      if (err) {
        setError(err)
        return
      }
      if (data) {
        setForm({ ...data })
        setSuccessMsg('Alterações salvas com sucesso!')
        onSaved(data)
        // Regra de negócio: NUNCA fechar o drawer ao salvar, permanece aberto na guia atual.
      }
    } else {
      const { data, error: err } = await createClient(payload as BemAvivClientInput)
      setSaving(false)
      if (err) {
        setError(err)
        return
      }
      if (data) {
        setForm({ ...data })
        setSuccessMsg('Cliente criado com sucesso!')
        onSaved(data)
      }
    }
  }

  const handleDelete = async () => {
    if (!client?.id) return
    if (!confirm(`Excluir "${client.full_name}"? Esta ação não pode ser desfeita.`)) return
    setDeleting(true)
    const { error: err } = await deleteClient(client.id, companyId)
    setDeleting(false)
    if (err) {
      setError(err)
      return
    }
    if (onDeleted) onDeleted(client.id)
    onClose()
  }

  const handleStartEditRelative = (rel: Familiar) => {
    setEditingRelativeId(rel.id)
    setNewRelative({
      name: rel.name || '',
      relationship: rel.relationship || 'CÔNJUGE',
      cpf: rel.cpf || '',
      birth_date: formatDateInput(rel.birth_date),
      phone: rel.phone || '',
    })
  }

  const handleCancelEditRelative = () => {
    setEditingRelativeId(null)
    setNewRelative({ name: '', relationship: 'CÔNJUGE', cpf: '', birth_date: '', phone: '' })
  }

  const handleCreateClientNow = async (rel: Familiar) => {
    if (!client) return
    setCreatingClientForRelId(rel.id)
    setError(null)
    setSuccessMsg(null)
    try {
      const { client: created, updatedTitular, error: cErr } = await createClientFromRelative(rel, client, companyId)
      if (cErr || !created) {
        setError(cErr || 'Não foi possível criar o cliente para o cônjuge.')
        return
      }
      if (updatedTitular) {
        setForm((prev) => ({ ...prev, full_name: updatedTitular.full_name }))
        onSaved(updatedTitular)
      }
      setSuccessMsg(`Cadastro de cliente criado e vinculado com sucesso para "${created.full_name}"!`)
      if (onClientCreated) onClientCreated(created)
      else onSaved(created)

      // Recarrega familiares e pedidos unificados
      const { data: updatedRels } = await fetchRelativesResult(client.id, companyId)
      setRelatives(updatedRels)
      const { data: updatedOrders } = await fetchClientOrdersResult(client.id, companyId)
      setOrders(updatedOrders)
    } catch (e: any) {
      setError(e?.message || 'Erro ao processar criação de cliente.')
    } finally {
      setCreatingClientForRelId(null)
    }
  }

  const handleSaveRelative = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!client?.id) return
    if (!newRelative.name.trim()) {
      setError('Informe o nome completo do familiar.')
      return
    }
    setAddingRelative(true)
    setError(null)
    setSuccessMsg(null)

    const cleanRelName = extractBaseClientName(newRelative.name)
    const relRelationship = (newRelative.relationship || 'OUTRO').trim().toUpperCase()
    const isSpouse = ['CÔNJUGE', 'CONJUGE', 'ESPOSO', 'ESPOSA'].includes(relRelationship)

    const payload = {
      name: cleanRelName,
      relationship: relRelationship,
      cpf: newRelative.cpf.trim() || null,
      birth_date: newRelative.birth_date || null,
      phone: newRelative.phone.trim() || null,
    }

    if (editingRelativeId) {
      const { data, error: relErr } = await updateRelative(editingRelativeId, payload, companyId)
      setAddingRelative(false)
      if (relErr) {
        setError(relErr)
        return
      }
      if (data) {
        setRelatives((prev) => prev.map((r) => (r.id === editingRelativeId ? data : r)))
        handleCancelEditRelative()
        setSuccessMsg('Familiar atualizado com sucesso!')

        // Se for cônjuge, sincroniza os nomes
        if (isSpouse) {
          const baseTitular = extractBaseClientName(client.full_name)
          const titularFullName = formatClientWithSpouseName(baseTitular, cleanRelName)
          if (client.full_name !== titularFullName) {
            const { data: updatedTitular } = await updateClient(client.id, { full_name: titularFullName }, companyId)
            if (updatedTitular) {
              setForm((prev) => ({ ...prev, full_name: updatedTitular.full_name }))
              onSaved(updatedTitular)
            }
          }
          if (data.linked_client_id) {
            const spouseFullName = formatClientWithSpouseName(cleanRelName, baseTitular)
            const { data: updatedSpouse } = await updateClient(data.linked_client_id, { full_name: spouseFullName }, companyId)
            if (updatedSpouse && onClientCreated) {
              onClientCreated(updatedSpouse)
            }
          }
        }
      }
    } else {
      const { data, error: relErr } = await createRelative({
        ...payload,
        client_id: client.id,
        company_id: companyId,
      })
      if (relErr) {
        setAddingRelative(false)
        setError(relErr)
        return
      }
      if (data) {
        if (isSpouse && autoCreateClient) {
          const { client: createdClient, updatedTitular, error: cErr } = await createClientFromRelative(data, client, companyId)
          if (createdClient) {
            if (updatedTitular) {
              setForm((prev) => ({ ...prev, full_name: updatedTitular.full_name }))
              onSaved(updatedTitular)
            }
            if (onClientCreated) onClientCreated(createdClient)
            else onSaved(createdClient)
            setSuccessMsg(`Familiar adicionado e novo cliente "${createdClient.full_name}" vinculado com sucesso!`)
          } else if (cErr) {
            console.warn('Familiar criado, mas aviso ao vincular cliente:', cErr)
          }
        } else if (isSpouse) {
          // Flag não marcada, mas cônjuge vinculado: titular fica NOME [CONJUGE]
          const baseTitular = extractBaseClientName(client.full_name)
          const titularFullName = formatClientWithSpouseName(baseTitular, cleanRelName)
          if (client.full_name !== titularFullName) {
            const { data: updatedTitular } = await updateClient(client.id, { full_name: titularFullName }, companyId)
            if (updatedTitular) {
              setForm((prev) => ({ ...prev, full_name: updatedTitular.full_name }))
              onSaved(updatedTitular)
            }
          }
          setSuccessMsg('Familiar cadastrado com sucesso!')
        } else {
          setSuccessMsg('Familiar cadastrado com sucesso!')
        }

        const { data: updatedRels } = await fetchRelativesResult(client.id, companyId)
        setRelatives(updatedRels)
        const { data: updatedOrders } = await fetchClientOrdersResult(client.id, companyId)
        setOrders(updatedOrders)
        handleCancelEditRelative()
      }
      setAddingRelative(false)
    }
  }

  const handleDeleteRelative = async (relId: string, relName: string) => {
    if (!confirm(`Excluir familiar "${relName}"?`)) return
    setError(null)
    const targetRel = relatives.find((r) => r.id === relId)
    const isSpouse = targetRel && ['CÔNJUGE', 'CONJUGE', 'ESPOSO', 'ESPOSA'].includes((targetRel.relationship || '').toUpperCase())

    const { error: delErr } = await deleteRelative(relId, companyId)
    if (delErr) {
      setError(delErr)
      return
    }
    const remainingRelatives = relatives.filter((r) => r.id !== relId)
    setRelatives(remainingRelatives)
    if (editingRelativeId === relId) {
      handleCancelEditRelative()
    }
    setSuccessMsg('Familiar removido com sucesso!')

    // Se o familiar excluído era cônjuge e não sobrou nenhum outro cônjuge, reverte o nome do titular para o base
    if (isSpouse && client) {
      const remainingSpouses = remainingRelatives.filter((r) =>
        ['CÔNJUGE', 'CONJUGE', 'ESPOSO', 'ESPOSA'].includes((r.relationship || '').toUpperCase())
      )
      if (remainingSpouses.length === 0) {
        const baseTitular = extractBaseClientName(client.full_name)
        if (client.full_name !== baseTitular) {
          const { data: updatedTitular } = await updateClient(client.id, { full_name: baseTitular }, companyId)
          if (updatedTitular) {
            setForm((prev) => ({ ...prev, full_name: updatedTitular.full_name }))
            onSaved(updatedTitular)
          }
        }
      }
    }
  }

  const orderStats = useMemo(() => {
    const s = computeOrderStats(orders)
    return {
      total: s.total,
      count: s.count,
      average: s.average,
      lastOrderDate: s.lastOrderDate ? formatDate(s.lastOrderDate) : '—',
    }
  }, [orders])

  const formatBRL = (val: number) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  const BRAND_BLUE = '#0D6BAF'

  const inputClass = (disabled = false) => ({
    width: '100%',
    border: '1px solid #D1D5DB',
    borderRadius: 8,
    padding: '8px 12px',
    fontSize: 14,
    color: '#111827',
    background: disabled ? '#F9FAFB' : '#FFFFFF',
    outline: 'none',
    transition: 'border-color 0.15s',
    boxSizing: 'border-box' as const,
  })

  const labelStyle = { fontSize: 12, fontWeight: 700, color: '#6B7280', marginBottom: 4, display: 'block' as const }

  return (
    <>
      {/* overlay */}
      <div
        ref={overlayRef}
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.35)',
          zIndex: 998,
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'all' : 'none',
          transition: 'opacity 0.25s',
        }}
      />

      {/* drawer */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: '100%',
          maxWidth: 640,
          background: '#FFFFFF',
          boxShadow: '-8px 0 40px rgba(0,0,0,0.15)',
          zIndex: 999,
          display: 'flex',
          flexDirection: 'column',
          transform: open ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid #F3F4F6',
            background: BRAND_BLUE,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#FFFFFF' }}>
                {client ? 'Editar Cliente' : 'Novo Cliente'}
              </h2>
              {client && (
                <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>
                  {client.full_name}
                </p>
              )}
            </div>
            {client && (client.phone_1 || client.phone_2) && getWhatsappUrl(client.phone_1 || client.phone_2) && (
              <a
                href={getWhatsappUrl(client.phone_1 || client.phone_2)!}
                target="_blank"
                rel="noreferrer"
                title="Abrir conversa no WhatsApp"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: '#25D366',
                  color: '#FFFFFF',
                  textDecoration: 'none',
                  boxShadow: '0 2px 8px rgba(37,211,102,0.3)',
                  flexShrink: 0,
                }}
              >
                <MessageCircle size={18} />
              </a>
            )}
          </div>
          <button
            onClick={onClose}
            title="Fechar"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'rgba(255,255,255,0.8)',
              padding: 4,
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid #F3F4F6', background: '#FAFAFA', overflowX: 'auto' }}>
          {[
            { id: 'dados', label: 'Dados Pessoais' },
            { id: 'contato', label: 'Endereço' },
            { id: 'familiares', label: `Familiares (${relatives.length})` },
            { id: 'followup', label: 'Follow-up' },
            { id: 'pedidos', label: `Pedidos (${orders.length})` },
          ].map((t) => {
            const isActive = tab === t.id
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id as DrawerTab)}
                style={{
                  flex: 1,
                  padding: '12px 10px',
                  fontSize: 12,
                  fontWeight: 700,
                  border: 'none',
                  borderBottom: isActive ? `2px solid ${BRAND_BLUE}` : '2px solid transparent',
                  background: 'none',
                  cursor: 'pointer',
                  color: isActive ? BRAND_BLUE : '#9CA3AF',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.15s',
                }}
              >
                {t.label}
              </button>
            )
          })}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
          {error && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 14px',
                background: '#FEF2F2',
                border: '1px solid #FECACA',
                borderRadius: 8,
                marginBottom: 16,
              }}
            >
              <AlertCircle size={16} color="#DC2626" />
              <span style={{ fontSize: 13, color: '#DC2626' }}>{error}</span>
            </div>
          )}
          {successMsg && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 14px',
                background: '#F0FDF4',
                border: '1px solid #BBF7D0',
                borderRadius: 8,
                marginBottom: 16,
              }}
            >
              <CheckCircle2 size={16} color="#16A34A" />
              <span style={{ fontSize: 13, color: '#16A34A', fontWeight: 600 }}>{successMsg}</span>
            </div>
          )}

          {/* ── Aba 1: Dados Pessoais ── */}
          {tab === 'dados' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={labelStyle}>Nome Completo *</label>
                <input
                  style={inputClass()}
                  value={form.full_name ?? ''}
                  onChange={(e) => set('full_name', e.target.value.toUpperCase())}
                  placeholder="NOME COMPLETO"
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>CPF</label>
                  <input
                    style={inputClass()}
                    value={form.cpf ?? ''}
                    onChange={(e) => set('cpf', e.target.value)}
                    placeholder="000.000.000-00"
                  />
                </div>
                <div>
                  <label style={labelStyle}>Data de Nascimento</label>
                  <input
                    style={inputClass()}
                    type="date"
                    value={formatDateInput(form.birth_date)}
                    onChange={(e) => set('birth_date', e.target.value || null)}
                  />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Telefone 1</label>
                  <input
                    style={inputClass()}
                    value={form.phone_1 ?? ''}
                    onChange={(e) => set('phone_1', e.target.value)}
                    placeholder="(00) 00000-0000"
                  />
                </div>
                <div>
                  <label style={labelStyle}>Telefone 2</label>
                  <input
                    style={inputClass()}
                    value={form.phone_2 ?? ''}
                    onChange={(e) => set('phone_2', e.target.value)}
                    placeholder="(00) 00000-0000"
                  />
                </div>
              </div>
              <div>
                <label style={labelStyle}>E-mail</label>
                <input
                  style={inputClass()}
                  type="email"
                  value={form.email ?? ''}
                  onChange={(e) => set('email', e.target.value)}
                  placeholder="cliente@email.com"
                />
              </div>
              <div>
                <label style={labelStyle}>Grupo / Referência</label>
                <input
                  style={inputClass()}
                  value={form.group_reference ?? ''}
                  onChange={(e) => set('group_reference', e.target.value)}
                  placeholder="Ex: Família Silva, Indicação Dr. Marcos..."
                />
              </div>
            </div>
          )}

          {/* ── Aba 2: Endereço ── */}
          {tab === 'contato' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>CEP</label>
                  <input
                    style={inputClass()}
                    value={form.cep ?? ''}
                    onChange={(e) => set('cep', e.target.value)}
                    placeholder="00000-000"
                  />
                </div>
                <div>
                  <label style={labelStyle}>Rua / Logradouro</label>
                  <input
                    style={inputClass()}
                    value={form.address_street ?? ''}
                    onChange={(e) => set('address_street', e.target.value)}
                    placeholder="Rua das Flores"
                  />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Número</label>
                  <input
                    style={inputClass()}
                    value={form.address_number ?? ''}
                    onChange={(e) => set('address_number', e.target.value)}
                    placeholder="123"
                  />
                </div>
                <div>
                  <label style={labelStyle}>Complemento</label>
                  <input
                    style={inputClass()}
                    value={form.address_complement ?? ''}
                    onChange={(e) => set('address_complement', e.target.value)}
                    placeholder="Apto 101, Bloco B"
                  />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Bairro</label>
                  <input
                    style={inputClass()}
                    value={form.address_district ?? ''}
                    onChange={(e) => set('address_district', e.target.value)}
                    placeholder="Centro"
                  />
                </div>
                <div>
                  <label style={labelStyle}>Cidade</label>
                  <input
                    style={inputClass()}
                    value={form.address_city ?? ''}
                    onChange={(e) => set('address_city', e.target.value)}
                    placeholder="São José"
                  />
                </div>
                <div>
                  <label style={labelStyle}>UF</label>
                  <input
                    style={inputClass()}
                    value={form.address_state ?? ''}
                    onChange={(e) => set('address_state', e.target.value.toUpperCase())}
                    maxLength={2}
                    placeholder="SC"
                  />
                </div>
              </div>
            </div>
          )}

          {/* ── Aba 3: Familiares ── */}
          {tab === 'familiares' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {!client?.id ? (
                <div
                  style={{
                    padding: '24px',
                    textAlign: 'center',
                    background: '#FAFAFA',
                    borderRadius: 10,
                    border: '1px dashed #E5E7EB',
                  }}
                >
                  <p style={{ margin: 0, fontSize: 13, color: '#6B7280' }}>
                    Salve o cadastro do cliente primeiro para adicionar familiares vinculados.
                  </p>
                </div>
              ) : (
                <>
                  {/* Formulário de Adicionar / Editar Familiar */}
                  <form
                    onSubmit={handleSaveRelative}
                    style={{
                      background: '#F9FAFB',
                      border: '1px solid #E5E7EB',
                      borderRadius: 10,
                      padding: 16,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 12,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 12, fontWeight: 800, color: BRAND_BLUE, textTransform: 'uppercase' }}>
                        {editingRelativeId ? 'Editar Familiar' : 'Adicionar Familiar'}
                      </span>
                      {editingRelativeId && (
                        <button
                          type="button"
                          onClick={handleCancelEditRelative}
                          style={{
                            border: 'none',
                            background: 'none',
                            color: '#6B7280',
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          Cancelar Edição
                        </button>
                      )}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr', gap: 10 }}>
                      <div>
                        <label style={labelStyle}>Nome Completo *</label>
                        <input
                          style={inputClass()}
                          value={newRelative.name}
                          onChange={(e) => setNewRelative((prev) => ({ ...prev, name: e.target.value.toUpperCase() }))}
                          placeholder="NOME DO FAMILIAR"
                        />
                      </div>
                      <div>
                        <label style={labelStyle}>Parentesco</label>
                        <select
                          style={inputClass()}
                          value={newRelative.relationship}
                          onChange={(e) => setNewRelative((prev) => ({ ...prev, relationship: e.target.value }))}
                        >
                          <option value="CÔNJUGE">Cônjuge</option>
                          <option value="FILHO(A)">Filho(a)</option>
                          <option value="PAI/MÃE">Pai/Mãe</option>
                          <option value="IRMÃO(Ã)">Irmão(ã)</option>
                          <option value="OUTRO">Outro</option>
                        </select>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.2fr 1.6fr', gap: 10 }}>
                      <div>
                        <label style={labelStyle}>CPF</label>
                        <input
                          style={inputClass()}
                          value={newRelative.cpf}
                          onChange={(e) => setNewRelative((prev) => ({ ...prev, cpf: e.target.value }))}
                          placeholder="000.000.000-00"
                        />
                      </div>
                      <div>
                        <label style={labelStyle}>Nascimento</label>
                        <input
                          style={inputClass()}
                          type="date"
                          value={newRelative.birth_date}
                          onChange={(e) => setNewRelative((prev) => ({ ...prev, birth_date: e.target.value }))}
                        />
                      </div>
                      <div>
                        <label style={labelStyle}>Telefone</label>
                        <input
                          style={inputClass()}
                          value={newRelative.phone}
                          onChange={(e) => setNewRelative((prev) => ({ ...prev, phone: e.target.value }))}
                          placeholder="(00) 00000-0000"
                        />
                      </div>
                    </div>

                    {['CÔNJUGE', 'CONJUGE', 'ESPOSO', 'ESPOSA'].includes(newRelative.relationship.toUpperCase()) &&
                      !editingRelativeId && (
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            padding: '8px 12px',
                            background: '#EFF6FF',
                            borderRadius: 8,
                            border: '1px solid #BFDBFE',
                          }}
                        >
                          <input
                            type="checkbox"
                            id="chk-auto-create"
                            checked={autoCreateClient}
                            onChange={(e) => setAutoCreateClient(e.target.checked)}
                            style={{ cursor: 'pointer' }}
                          />
                          <label
                            htmlFor="chk-auto-create"
                            style={{ fontSize: 12, fontWeight: 600, color: '#1E40AF', cursor: 'pointer' }}
                          >
                            Criar e vincular cadastro de cliente automaticamente para o cônjuge
                          </label>
                        </div>
                      )}

                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
                      <button
                        type="submit"
                        disabled={addingRelative}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '8px 16px',
                          borderRadius: 8,
                          fontSize: 12,
                          fontWeight: 700,
                          background: BRAND_BLUE,
                          color: '#FFFFFF',
                          border: 'none',
                          cursor: addingRelative ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {addingRelative ? (
                          <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
                        ) : (
                          <Save size={13} />
                        )}
                        {editingRelativeId ? 'Atualizar Familiar' : 'Salvar Familiar'}
                      </button>
                    </div>
                  </form>

                  {/* Lista de Familiares */}
                  <div>
                    <span style={{ fontSize: 12, fontWeight: 800, color: '#6B7280', textTransform: 'uppercase' }}>
                      Familiares Cadastrados ({relatives.length})
                    </span>

                    {loadingRelatives ? (
                      <p style={{ fontSize: 13, color: '#9CA3AF', marginTop: 8 }}>Carregando familiares...</p>
                    ) : relatives.length === 0 ? (
                      <p style={{ fontSize: 13, color: '#9CA3AF', marginTop: 8 }}>
                        Nenhum familiar cadastrado para este cliente.
                      </p>
                    ) : (
                      <div style={{ border: '1px solid #E5E7EB', borderRadius: 10, overflowX: 'auto', marginTop: 8 }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                          <thead>
                            <tr
                              style={{
                                background: '#F9FAFB',
                                borderBottom: '1px solid #E5E7EB',
                                textAlign: 'left',
                                color: '#6B7280',
                                fontWeight: 700,
                              }}
                            >
                              <th style={{ padding: '8px 10px' }}>NOME</th>
                              <th style={{ padding: '8px 10px' }}>PARENTESCO</th>
                              <th style={{ padding: '8px 10px' }}>VÍNCULO CLIENTE</th>
                              <th style={{ padding: '8px 10px' }}>CPF</th>
                              <th style={{ padding: '8px 10px' }}>NASCIMENTO</th>
                              <th style={{ padding: '8px 10px' }}>TELEFONE</th>
                              <th style={{ padding: '8px 10px', textAlign: 'right' }}>AÇÕES</th>
                            </tr>
                          </thead>
                          <tbody>
                            {relatives.map((rel, idx) => {
                              const isSpouse = ['CÔNJUGE', 'CONJUGE', 'ESPOSO', 'ESPOSA'].includes(
                                (rel.relationship || '').toUpperCase()
                              )
                              const waUrl = getWhatsappUrl(rel.phone)

                              return (
                                <tr
                                  key={rel.id}
                                  style={{
                                    borderBottom: idx < relatives.length - 1 ? '1px solid #F3F4F6' : 'none',
                                    background: idx % 2 === 0 ? '#FFFFFF' : '#FAFAFA',
                                  }}
                                >
                                  <td style={{ padding: '8px 10px', fontWeight: 600, color: '#111827' }}>{rel.name}</td>
                                  <td style={{ padding: '8px 10px', color: '#4B5563' }}>{rel.relationship}</td>
                                  <td style={{ padding: '8px 10px' }}>
                                    {rel.linked_client_id ? (
                                      <button
                                        type="button"
                                        onClick={() => onOpenClient && onOpenClient(rel.linked_client_id!)}
                                        style={{
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: 4,
                                          padding: '2px 8px',
                                          borderRadius: 4,
                                          fontSize: 11,
                                          fontWeight: 700,
                                          background: '#ECFDF5',
                                          color: '#065F46',
                                          border: '1px solid #A7F3D0',
                                          cursor: onOpenClient ? 'pointer' : 'default',
                                        }}
                                      >
                                        <CheckCircle2 size={11} />
                                        Cliente Vinculado
                                      </button>
                                    ) : isSpouse ? (
                                      <button
                                        type="button"
                                        onClick={() => handleCreateClientNow(rel)}
                                        disabled={creatingClientForRelId === rel.id}
                                        style={{
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: 4,
                                          padding: '2px 8px',
                                          borderRadius: 4,
                                          fontSize: 11,
                                          fontWeight: 700,
                                          background: '#EFF6FF',
                                          color: '#1D4ED8',
                                          border: '1px solid #BFDBFE',
                                          cursor: creatingClientForRelId === rel.id ? 'not-allowed' : 'pointer',
                                        }}
                                      >
                                        {creatingClientForRelId === rel.id ? (
                                          <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />
                                        ) : (
                                          <UserPlus size={12} />
                                        )}
                                        Criar Cliente
                                      </button>
                                    ) : (
                                      <span style={{ color: '#9CA3AF', fontSize: 11 }}>—</span>
                                    )}
                                  </td>
                                  <td style={{ padding: '8px 10px', color: '#6B7280', whiteSpace: 'nowrap' }}>
                                    {rel.cpf || '—'}
                                  </td>
                                  <td style={{ padding: '8px 10px', color: '#6B7280', whiteSpace: 'nowrap' }}>
                                    {formatDate(rel.birth_date)}
                                  </td>
                                  <td style={{ padding: '8px 10px', color: '#6B7280', whiteSpace: 'nowrap' }}>
                                    {rel.phone ? (
                                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                        <span>{formatPhone(rel.phone)}</span>
                                        {waUrl && (
                                          <a
                                            href={waUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                            onClick={(e) => e.stopPropagation()}
                                            title="Enviar mensagem no WhatsApp"
                                            style={{
                                              display: 'inline-flex',
                                              alignItems: 'center',
                                              justifyContent: 'center',
                                              width: 20,
                                              height: 20,
                                              borderRadius: 6,
                                              background: '#25D366',
                                              color: '#FFFFFF',
                                              textDecoration: 'none',
                                              flexShrink: 0,
                                            }}
                                          >
                                            <MessageCircle size={11} />
                                          </a>
                                        )}
                                      </div>
                                    ) : (
                                      '—'
                                    )}
                                  </td>
                                  <td
                                    style={{
                                      padding: '8px 10px',
                                      textAlign: 'right',
                                      whiteSpace: 'nowrap',
                                      minWidth: 70,
                                    }}
                                  >
                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                      <button
                                        onClick={() => handleStartEditRelative(rel)}
                                        style={{
                                          border: 'none',
                                          background: 'none',
                                          cursor: 'pointer',
                                          color: BRAND_BLUE,
                                          padding: 4,
                                        }}
                                        title="Editar familiar"
                                      >
                                        <Pencil size={14} />
                                      </button>
                                      <button
                                        onClick={() => handleDeleteRelative(rel.id, rel.name)}
                                        style={{
                                          border: 'none',
                                          background: 'none',
                                          cursor: 'pointer',
                                          color: '#EF4444',
                                          padding: 4,
                                        }}
                                        title="Remover familiar"
                                      >
                                        <Trash2 size={14} />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── Aba 4: Follow-up / Histórico ── */}
          {tab === 'followup' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {!client?.id ? (
                <div
                  style={{
                    padding: '24px',
                    textAlign: 'center',
                    background: '#FAFAFA',
                    borderRadius: 10,
                    border: '1px dashed #E5E7EB',
                  }}
                >
                  <p style={{ margin: 0, fontSize: 13, color: '#6B7280' }}>
                    Salve o cadastro do cliente primeiro para registrar contatos e agendamentos de follow-up.
                  </p>
                </div>
              ) : (
                <V2ClientFollowupSheet
                  client={client}
                  companyId={companyId || client.company_id || '10000000-0000-4000-8000-000000000001'}
                  onClientUpdated={() => {
                    onSaved(client)
                  }}
                />
              )}
            </div>
          )}

          {/* ── Aba 5: Pedidos / Orçamentos ── */}
          {tab === 'pedidos' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {!client?.id ? (
                <div
                  style={{
                    padding: '24px',
                    textAlign: 'center',
                    background: '#FAFAFA',
                    borderRadius: 10,
                    border: '1px dashed #E5E7EB',
                  }}
                >
                  <p style={{ margin: 0, fontSize: 13, color: '#6B7280' }}>
                    Salve o cadastro do cliente primeiro para visualizar os pedidos e orçamentos.
                  </p>
                </div>
              ) : (
                <>
                  {orders.some((o) => o.is_linked_spouse) && (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '10px 14px',
                        background: '#EFF6FF',
                        border: '1px solid #BFDBFE',
                        borderRadius: 8,
                      }}
                    >
                      <Users size={16} color="#1D4ED8" />
                      <span style={{ fontSize: 12, color: '#1E40AF', fontWeight: 600 }}>
                        Visualização Unificada: Mostrando pedidos combinados de {client.full_name} e cônjuge(s)
                        vinculado(s).
                      </span>
                    </div>
                  )}

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                      gap: 10,
                    }}
                  >
                    <div
                      style={{
                        background: '#F9FAFB',
                        border: '1px solid #E5E7EB',
                        borderRadius: 10,
                        padding: 12,
                      }}
                    >
                      <p
                        style={{
                          margin: 0,
                          fontSize: 10,
                          fontWeight: 800,
                          color: '#6B7280',
                          textTransform: 'uppercase',
                        }}
                      >
                        Total em Pedidos
                      </p>
                      <p style={{ margin: '4px 0 0', fontSize: 16, fontWeight: 900, color: '#111827' }}>
                        {formatBRL(orderStats.total)}
                      </p>
                    </div>
                    <div
                      style={{
                        background: '#F9FAFB',
                        border: '1px solid #E5E7EB',
                        borderRadius: 10,
                        padding: 12,
                      }}
                    >
                      <p
                        style={{
                          margin: 0,
                          fontSize: 10,
                          fontWeight: 800,
                          color: '#6B7280',
                          textTransform: 'uppercase',
                        }}
                      >
                        Ticket Médio
                      </p>
                      <p style={{ margin: '4px 0 0', fontSize: 16, fontWeight: 900, color: '#111827' }}>
                        {formatBRL(orderStats.average)}
                      </p>
                    </div>
                    <div
                      style={{
                        background: '#F9FAFB',
                        border: '1px solid #E5E7EB',
                        borderRadius: 10,
                        padding: 12,
                      }}
                    >
                      <p
                        style={{
                          margin: 0,
                          fontSize: 10,
                          fontWeight: 800,
                          color: '#6B7280',
                          textTransform: 'uppercase',
                        }}
                      >
                        Última Venda
                      </p>
                      <p style={{ margin: '4px 0 0', fontSize: 16, fontWeight: 900, color: '#111827' }}>
                        {orderStats.lastOrderDate}
                      </p>
                    </div>
                  </div>

                  <div>
                    <p
                      style={{
                        margin: '0 0 8px',
                        fontSize: 12,
                        fontWeight: 800,
                        color: '#6B7280',
                        textTransform: 'uppercase',
                      }}
                    >
                      Histórico de Pedidos e Orçamentos ({orders.length})
                    </p>
                    {loadingOrders ? (
                      <p style={{ fontSize: 13, color: '#9CA3AF' }}>Carregando pedidos...</p>
                    ) : orders.length === 0 ? (
                      <div
                        style={{
                          padding: '24px',
                          textAlign: 'center',
                          background: '#FAFAFA',
                          borderRadius: 10,
                          border: '1px dashed #E5E7EB',
                        }}
                      >
                        <p style={{ margin: 0, fontSize: 13, color: '#9CA3AF' }}>
                          Nenhum pedido ou orçamento encontrado para este cliente.
                        </p>
                      </div>
                    ) : (
                      <div style={{ border: '1px solid #E5E7EB', borderRadius: 10, overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                          <thead>
                            <tr
                              style={{
                                background: '#F9FAFB',
                                borderBottom: '1px solid #E5E7EB',
                                textAlign: 'left',
                                color: '#6B7280',
                                fontWeight: 700,
                              }}
                            >
                              <th style={{ padding: '8px 8px', whiteSpace: 'nowrap' }}>DATA</th>
                              <th style={{ padding: '8px 8px', whiteSpace: 'nowrap' }}>COMPRADOR</th>
                              <th style={{ padding: '8px 8px', whiteSpace: 'nowrap' }}>TIPO</th>
                              <th style={{ padding: '8px 8px', whiteSpace: 'nowrap' }}>Nº DOC</th>
                              <th
                                style={{
                                  padding: '8px 8px',
                                  textAlign: 'right',
                                  whiteSpace: 'nowrap',
                                  minWidth: 90,
                                }}
                              >
                                VALOR
                              </th>
                              <th style={{ padding: '8px 8px' }}>STATUS</th>
                            </tr>
                          </thead>
                          <tbody>
                            {orders.map((ord, idx) => (
                              <tr
                                key={ord.id}
                                style={{
                                  borderBottom: idx < orders.length - 1 ? '1px solid #F3F4F6' : 'none',
                                  background: idx % 2 === 0 ? '#FFFFFF' : '#FAFAFA',
                                }}
                              >
                                <td style={{ padding: '8px 8px', color: '#374151', whiteSpace: 'nowrap' }}>
                                  {formatDate(ord.order_date)}
                                </td>
                                <td style={{ padding: '8px 8px', whiteSpace: 'nowrap' }}>
                                  <span
                                    style={{
                                      padding: '2px 8px',
                                      borderRadius: 4,
                                      fontSize: 11,
                                      fontWeight: 700,
                                      background: ord.is_linked_spouse ? '#F3E8FF' : '#EFF6FF',
                                      color: ord.is_linked_spouse ? '#7E22CE' : '#1D4ED8',
                                      border: `1px solid ${ord.is_linked_spouse ? '#E9D5FF' : '#DBEAFE'}`,
                                    }}
                                  >
                                    {ord.is_linked_spouse ? `Cônjuge: ${ord.client_name}` : 'Titular'}
                                  </span>
                                </td>
                                <td style={{ padding: '8px 8px', whiteSpace: 'nowrap' }}>
                                  <span
                                    style={{
                                      padding: '2px 6px',
                                      borderRadius: 4,
                                      fontSize: 10,
                                      fontWeight: 700,
                                      background: ord.document_type === 'PEDIDO' ? '#DBEAFE' : '#FEF3C7',
                                      color: ord.document_type === 'PEDIDO' ? '#1E40AF' : '#92400E',
                                    }}
                                  >
                                    {ord.document_type === 'PEDIDO' ? 'Pedido' : 'Orçamento'}
                                  </span>
                                </td>
                                <td
                                  style={{
                                    padding: '8px 8px',
                                    fontWeight: 600,
                                    color: '#111827',
                                    whiteSpace: 'nowrap',
                                  }}
                                >
                                  {ord.document_number || '—'}
                                </td>
                                <td
                                  style={{
                                    padding: '8px 8px',
                                    textAlign: 'right',
                                    fontWeight: 700,
                                    color: '#059669',
                                    whiteSpace: 'nowrap',
                                    minWidth: 90,
                                  }}
                                >
                                  {formatBRL(Number(ord.total_amount) || 0)}
                                </td>
                                <td style={{ padding: '8px 8px', color: '#4B5563', fontSize: 11 }}>
                                  {ord.status || '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            borderTop: '1px solid #F3F4F6',
            padding: '14px 20px',
            display: 'flex',
            gap: 10,
            background: '#FAFAFA',
          }}
        >
          {client && onDeleted && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '9px 14px',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 700,
                border: '1px solid #FECACA',
                background: '#FEF2F2',
                color: '#DC2626',
                cursor: deleting ? 'not-allowed' : 'pointer',
              }}
            >
              {deleting ? (
                <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
              ) : (
                <Trash2 size={14} />
              )}
              Excluir
            </button>
          )}
          <button
            onClick={onClose}
            title="Fechar"
            style={{
              flex: 1,
              padding: '9px 14px',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 700,
              border: '1px solid #D1D5DB',
              background: '#FFFFFF',
              color: '#374151',
              cursor: 'pointer',
            }}
          >
            Fechar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              flex: 2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: '9px 20px',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 700,
              border: 'none',
              background: BRAND_BLUE,
              color: '#FFFFFF',
              cursor: saving ? 'not-allowed' : 'pointer',
            }}
          >
            {saving ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={14} />}
            {client ? 'Salvar Alterações' : 'Criar Cliente'}
          </button>
        </div>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </>
  )
}
