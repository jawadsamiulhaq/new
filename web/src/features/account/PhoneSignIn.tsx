import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ShieldCheck } from 'lucide-react'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { api, type SendCodeResponse } from '../../lib/api'
import { Turnstile } from './Turnstile'

const RESEND_SECONDS = 30

const inputClass =
  'w-full rounded-xl border border-line bg-coal px-4 py-3 text-cream placeholder:text-muted/70 focus:border-mustard focus:outline-none'

/**
 * Two-step phone sign-in: enter mobile number → receive SMS code → enter code.
 * No passwords; the verified number becomes the customer's account.
 */
export function PhoneSignIn({ onSignedIn }: { onSignedIn?: () => void }) {
  const queryClient = useQueryClient()
  const { data: config } = useQuery({ queryKey: ['auth-config'], queryFn: api.authConfig, staleTime: Infinity })
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState<SendCodeResponse | null>(null)
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const [resendIn, setResendIn] = useState(0)

  useEffect(() => {
    if (resendIn <= 0) return
    const timer = setTimeout(() => setResendIn((s) => s - 1), 1000)
    return () => clearTimeout(timer)
  }, [resendIn])

  const send = useMutation({
    mutationFn: () => api.sendCode(phone, turnstileToken),
    onSuccess: (result) => {
      setSent(result)
      setCode('')
      setResendIn(RESEND_SECONDS)
    },
  })

  const verify = useMutation({
    mutationFn: () => api.verifyCode(phone, code),
    onSuccess: (result) => {
      queryClient.setQueryData(['me'], result.customer)
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      onSignedIn?.()
    },
  })

  const onToken = useCallback((token: string | null) => setTurnstileToken(token), [])
  const needsTurnstile = Boolean(config?.turnstileSiteKey)

  function submitPhone(e: FormEvent) {
    e.preventDefault()
    send.mutate()
  }

  function submitCode(e: FormEvent) {
    e.preventDefault()
    verify.mutate()
  }

  if (!sent) {
    return (
      <form onSubmit={submitPhone} className="space-y-3">
        <label htmlFor="phone" className="block text-sm font-semibold">
          Mobile number
        </label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            id="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="0300-1234567"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={inputClass}
            required
          />
          <button type="submit" className="btn-primary shrink-0" disabled={send.isPending || phone.trim().length < 10 || (needsTurnstile && !turnstileToken)}>
            {send.isPending ? 'Sending…' : 'Send code'}
          </button>
        </div>
        {needsTurnstile && <Turnstile siteKey={config!.turnstileSiteKey!} onToken={onToken} />}
        {send.error && (
          <p role="alert" className="text-sm text-danger">
            {send.error.message}
          </p>
        )}
        <p className="flex items-center gap-1.5 text-xs text-muted">
          <ShieldCheck className="size-4" aria-hidden /> We’ll text you a 6-digit code. No password needed.
        </p>
      </form>
    )
  }

  return (
    <form onSubmit={submitCode} className="space-y-3">
      <p className="text-sm">
        Enter the code we sent to <span className="font-semibold">{sent.phone}</span>{' '}
        <button
          type="button"
          className="text-mustard underline-offset-2 hover:underline"
          onClick={() => {
            setSent(null)
            verify.reset()
          }}
        >
          Change
        </button>
      </p>
      {sent.devCode && (
        <p className="rounded-lg bg-coal px-3 py-2 text-xs text-muted">
          Development mode — no SMS sent. Your code is <span className="font-mono font-bold text-mustard">{sent.devCode}</span>
        </p>
      )}
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          aria-label="6-digit code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          placeholder="123456"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          className={`${inputClass} font-mono text-lg tracking-[0.4em]`}
          autoFocus
          required
        />
        <button type="submit" className="btn-primary shrink-0" disabled={verify.isPending || code.length !== 6}>
          {verify.isPending ? 'Checking…' : 'Verify'}
        </button>
      </div>
      {verify.error && (
        <p role="alert" className="text-sm text-danger">
          {verify.error.message}
        </p>
      )}
      <button
        type="button"
        disabled={resendIn > 0 || send.isPending}
        onClick={() => send.mutate()}
        className="text-sm text-muted hover:text-cream disabled:hover:text-muted"
      >
        {resendIn > 0 ? `Resend code in ${resendIn}s` : 'Resend code'}
      </button>
    </form>
  )
}
