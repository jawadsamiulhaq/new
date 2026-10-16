import { Lock } from 'lucide-react'
import type { ReactNode } from 'react'
import { useOutletContext } from 'react-router'
import type { StaffMe } from './adminApi'
import { AreasPage } from './AreasPage'
import { PromosPage } from './PromosPage'
import { ReportsPage } from './ReportsPage'
import { SettingsPage } from './SettingsPage'
import { StaffPage } from './StaffPage'

// Admin screens are loaded as a separate bundle, only when someone opens /admin.
export { AdminLayout } from './AdminLayout'
export { LiveOrdersPage } from './LiveOrdersPage'
export { LoginPage } from './LoginPage'
export { MenuPage as AdminMenuPage } from './MenuPage'
export { OptionsPage } from './OptionsPage'
export { OrderHistoryPage } from './OrderHistoryPage'

/** The server enforces this too; this just shows a friendly message instead of errors. */
function OwnerOnly({ children }: { children: ReactNode }) {
  const me = useOutletContext<StaffMe>()
  if (me.role === 'Owner') return children
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-20 text-center">
      <Lock className="size-10 text-muted" aria-hidden />
      <h1 className="text-2xl font-extrabold">Owner only</h1>
      <p className="text-muted">Ask the owner if you need something changed here.</p>
    </div>
  )
}

export function OwnerAreasPage() {
  return <OwnerOnly><AreasPage /></OwnerOnly>
}

export function OwnerPromosPage() {
  return <OwnerOnly><PromosPage /></OwnerOnly>
}

export function OwnerReportsPage() {
  return <OwnerOnly><ReportsPage /></OwnerOnly>
}

export function OwnerStaffPage() {
  return <OwnerOnly><StaffPage /></OwnerOnly>
}

export function OwnerSettingsPage() {
  return <OwnerOnly><SettingsPage /></OwnerOnly>
}
