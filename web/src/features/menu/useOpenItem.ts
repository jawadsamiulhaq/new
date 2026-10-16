import { useCallback } from 'react'
import { useSearchParams } from 'react-router'

export const ITEM_PARAM = 'item'

/** Opens an item's dialog by putting `?item=<slug>` in the URL (so Back closes it and links are shareable). */
export function useOpenItem() {
  const [, setParams] = useSearchParams()
  return useCallback(
    (slug: string) =>
      setParams(
        (p) => {
          p.set(ITEM_PARAM, slug)
          return p
        },
        { state: { itemOpened: true }, preventScrollReset: true },
      ),
    [setParams],
  )
}
