import { useEffect, useState } from 'react'
import { useUser } from '../../hooks/useClerkCompat'
import { useSupabase } from '../../hooks/useSupabase'
import { resolveDataOwnerId } from '../../lib/dataOwner'
import { clerkEmailCandidates } from '../../lib/clerkEmails'
import { UserPlus } from 'lucide-react'

type FamilyMember = {
  id: string
  name: string
}

export function V2FamilyMembersPage() {
  const { user } = useUser()
  const supabase = useSupabase()
  const ownerUserId = resolveDataOwnerId(user?.id, clerkEmailCandidates(user).join(','))

  const [members, setMembers] = useState<FamilyMember[]>([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)

  const fetchMembers = async () => {
    if (!supabase || !ownerUserId) return
    setLoading(true)
    const { data } = await supabase.from('family_members').select('*').eq('user_id', ownerUserId).order('name')
    setMembers((data as FamilyMember[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    fetchMembers()
  }, [supabase, ownerUserId])

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!supabase || !ownerUserId || !newName) return
    setSaving(true)

    try {
      const { error } = await supabase.from('family_members').insert({
        user_id: ownerUserId,
        name: newName,
      })
      if (error) throw error
      setNewName('')
      fetchMembers()
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-900/60 backdrop-blur-md border border-slate-800/80 rounded-3xl p-6 shadow-xl">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              MÓDULO V2
            </span>
            <span className="text-xs text-slate-400">· Colaboração e Membros</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">Família & Colaboradores</h2>
        </div>
      </div>

      <form onSubmit={handleAdd} className="bg-slate-900/60 backdrop-blur-md border border-slate-800/80 rounded-2xl p-4 flex gap-3">
        <input
          type="text"
          required
          placeholder="Nome do novo membro..."
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-xs text-white outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <button
          type="submit"
          disabled={saving}
          className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg flex items-center gap-2"
        >
          <UserPlus className="h-4 w-4" />
          <span>{saving ? 'Adicionando...' : 'Adicionar'}</span>
        </button>
      </form>

      {loading ? (
        <div className="text-center py-12 text-slate-400 text-xs">Carregando membros...</div>
      ) : members.length === 0 ? (
        <div className="text-center py-12 text-slate-500 text-xs">Nenhum membro cadastrado.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {members.map((m) => (
            <div
              key={m.id}
              className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 flex items-center gap-3 text-xs font-bold text-slate-200 hover:border-slate-700 transition"
            >
              <div className="h-8 w-8 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 flex items-center justify-center font-bold">
                {m.name.charAt(0).toUpperCase()}
              </div>
              <span className="truncate">{m.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
