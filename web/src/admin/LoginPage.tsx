import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Lock } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router'
import { usePageTitle } from '../lib/usePageTitle'
import { useStaffMe } from './hooks'
import { adminApi } from './adminApi'
import { inputClass } from './ui'

export function LoginPage() {
  usePageTitle('Staff sign in')
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: me } = useStaffMe()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  // Only allow redirects inside the admin area.
  const nextParam = params.get('next') ?? ''
  const next = nextParam.startsWith('/admin') && !nextParam.startsWith('//') ? nextParam : '/admin'

  const login = useMutation({
    mutationFn: () => adminApi.login(email, password),
    onSuccess: (staff) => {
      queryClient.setQueryData(['admin', 'me'], staff)
      navigate(next, { replace: true })
    },
  })

  if (me) return <Navigate to={next} replace />

  function submit(e: FormEvent) {
    e.preventDefault()
    login.mutate()
  }

  return (
    <div className="grid min-h-dvh place-items-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-5 rounded-3xl border border-line bg-charcoal p-6 sm:p-8">
        <div>
          <p className="font-display text-2xl font-extrabold">
            Bur<span className="text-mustard">Chips</span> Admin
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
            <Lock className="size-4" aria-hidden /> Staff sign in
          </p>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="email" className="block text-sm font-semibold">
            Email
          </label>
          <input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} required />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="password" className="block text-sm font-semibold">
            Password
          </label>
          <input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} required />
        </div>
        {login.error && (
          <p role="alert" className="text-sm text-danger">
            {login.error.message}
          </p>
        )}
        <button type="submit" className="btn-primary w-full" disabled={login.isPending}>
          {login.isPending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
