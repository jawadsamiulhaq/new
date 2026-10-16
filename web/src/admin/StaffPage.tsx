import { useQuery } from '@tanstack/react-query'
import { KeyRound, Pencil, Plus } from 'lucide-react'
import { useState } from 'react'
import { adminApi, type Role, type StaffMember } from './adminApi'
import { useAdminMutation } from './hooks'
import { AdminDialog, Badge, Field, IconButton, inputClass, PageHeader, Switch } from './ui'

const invalidate = [['admin', 'staff']]
const PASSWORD_HINT = 'At least 10 characters, with upper- and lower-case letters and a number.'

export function StaffPage() {
  const { data: staff, isPending } = useQuery({ queryKey: ['admin', 'staff'], queryFn: adminApi.staff })
  const [editing, setEditing] = useState<StaffMember | 'new' | null>(null)
  const [resetting, setResetting] = useState<StaffMember | null>(null)

  return (
    <div>
      <PageHeader
        title="Staff"
        description="Owners can do everything. Staff can run Live Orders, mark items sold out and pause orders."
        actions={
          <button type="button" className="btn-primary px-4 py-2" onClick={() => setEditing('new')}>
            <Plus className="size-4" /> Add person
          </button>
        }
      />
      {isPending ? (
        <div className="h-60 animate-pulse rounded-2xl bg-coal" />
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-charcoal">
          {staff?.map((p) => (
            <li key={p.id} className={`flex flex-wrap items-center gap-3 p-4 ${p.isActive ? '' : 'opacity-60'}`}>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-semibold">
                  {p.displayName}
                  {p.isYou && <Badge>You</Badge>}
                  <Badge tone={p.role === 'Owner' ? 'mustard' : 'muted'}>{p.role}</Badge>
                  {!p.isActive && <Badge tone="danger">Deactivated</Badge>}
                  {p.isLockedOut && <Badge tone="danger">Locked — too many wrong passwords</Badge>}
                </p>
                <p className="text-sm text-muted">{p.email}</p>
              </div>
              <IconButton label={`Reset password for ${p.displayName}`} onClick={() => setResetting(p)}>
                <KeyRound className="size-4" />
              </IconButton>
              <IconButton label={`Edit ${p.displayName}`} onClick={() => setEditing(p)}>
                <Pencil className="size-4" />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
      {editing && <StaffEditor person={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {resetting && <ResetPassword person={resetting} onClose={() => setResetting(null)} />}
    </div>
  )
}

function StaffEditor({ person, onClose }: { person: StaffMember | null; onClose: () => void }) {
  const [email, setEmail] = useState(person?.email ?? '')
  const [displayName, setDisplayName] = useState(person?.displayName ?? '')
  const [role, setRole] = useState<Role>(person?.role ?? 'Staff')
  const [isActive, setIsActive] = useState(person?.isActive ?? true)
  const [password, setPassword] = useState('')

  const save = useAdminMutation(
    () =>
      person
        ? adminApi.updateStaff(person.id, { displayName, role, isActive })
        : adminApi.createStaff({ email, displayName, role, password }).then(() => undefined),
    { invalidate, success: person ? 'Saved' : 'Account created — share the password with them in person', onSuccess: onClose },
  )

  return (
    <AdminDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={person ? `Edit ${person.displayName}` : 'Add a person'}
      footer={
        <button type="button" className="btn-primary" disabled={!displayName.trim() || (!person && (!email || password.length < 10)) || save.isPending} onClick={() => save.mutate(undefined)}>
          Save
        </button>
      }
    >
      <Field label="Name" htmlFor="staff-name">
        <input id="staff-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={60} className={inputClass} />
      </Field>
      {!person && (
        <>
          <Field label="Email (used to sign in)" htmlFor="staff-email">
            <input id="staff-email" type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Temporary password" htmlFor="staff-password" hint={`${PASSWORD_HINT} They can change it after signing in.`}>
            <input id="staff-password" type="text" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
          </Field>
        </>
      )}
      <Field label="Role" htmlFor="staff-role">
        <select id="staff-role" value={role} onChange={(e) => setRole(e.target.value as Role)} className={inputClass} disabled={person?.isYou}>
          <option value="Staff">Staff — live orders, sold-out switches, pause</option>
          <option value="Owner">Owner — everything, including prices, reports and staff</option>
        </select>
      </Field>
      {person && !person.isYou && (
        <label className="flex items-center justify-between gap-3 text-sm font-semibold">
          Can sign in
          <Switch checked={isActive} onChange={setIsActive} label="Can sign in" tone="success" />
        </label>
      )}
    </AdminDialog>
  )
}

function ResetPassword({ person, onClose }: { person: StaffMember; onClose: () => void }) {
  const [password, setPassword] = useState('')
  const reset = useAdminMutation(() => adminApi.resetStaffPassword(person.id, password), { invalidate, success: 'Password reset — account unlocked', onSuccess: onClose })
  return (
    <AdminDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={`New password for ${person.displayName}`}
      footer={
        <button type="button" className="btn-primary" disabled={password.length < 10 || reset.isPending} onClick={() => reset.mutate(undefined)}>
          Reset password
        </button>
      }
    >
      <Field label="New password" htmlFor="reset-password" hint={PASSWORD_HINT}>
        <input id="reset-password" type="text" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
      </Field>
    </AdminDialog>
  )
}
