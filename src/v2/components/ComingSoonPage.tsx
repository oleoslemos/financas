// Placeholder page helper — used for menu items under construction
import { Construction } from 'lucide-react'

interface ComingSoonPageProps {
  title: string
  description?: string
  icon?: React.ReactNode
}

export function ComingSoonPage({ title, description, icon }: ComingSoonPageProps) {
  return (
    <div
      style={{
        padding: '40px 24px',
        maxWidth: 600,
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '60vh',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          width: 72,
          height: 72,
          borderRadius: 20,
          background: '#EFF6FF',
          border: '1.5px solid #BFDBFE',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 24,
        }}
      >
        {icon ?? <Construction size={32} color="#3B82F6" />}
      </div>
      <h1 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 900, color: '#111827' }}>{title}</h1>
      <p style={{ margin: 0, fontSize: 14, color: '#6B7280', lineHeight: 1.6 }}>
        {description ?? 'Esta página está em desenvolvimento. Em breve estará disponível.'}
      </p>
      <div
        style={{
          marginTop: 28,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 20px',
          borderRadius: 10,
          background: '#F3F4F6',
          fontSize: 12,
          fontWeight: 700,
          color: '#9CA3AF',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
        }}
      >
        EM BREVE
      </div>
    </div>
  )
}
