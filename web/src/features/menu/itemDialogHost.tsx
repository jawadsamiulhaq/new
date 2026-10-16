import { lazy, Suspense } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router'
import { useMenu } from '../../lib/queries'
import { ITEM_PARAM as PARAM } from './useOpenItem'

// Loaded on first tap, keeping the menu's initial download small.
const ItemDialog = lazy(() => import('./ItemDialog').then((m) => ({ default: m.ItemDialog })))

/** Renders the item dialog for whatever `?item=` is in the URL. Mounted once in the site layout. */
export function ItemDialogHost() {
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const { data: menu } = useMenu()

  const slug = params.get(PARAM)
  if (!slug || !menu) return null

  const category = menu.categories.find((c) => c.items.some((i) => i.slug === slug))
  const item = category?.items.find((i) => i.slug === slug)
  if (!category || !item) return null

  const close = () => {
    // Opened from within the site: step back so the history stays clean. Opened from a shared link: just drop the param.
    if ((location.state as { itemOpened?: boolean } | null)?.itemOpened) {
      navigate(-1)
    } else {
      setParams(
        (p) => {
          p.delete(PARAM)
          return p
        },
        { replace: true, preventScrollReset: true },
      )
    }
  }

  return (
    <Suspense fallback={null}>
      <ItemDialog key={slug} item={item} category={category} onClose={close} />
    </Suspense>
  )
}
