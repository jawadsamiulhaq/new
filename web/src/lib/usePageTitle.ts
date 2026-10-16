import { useEffect } from 'react'

const SITE = 'BurChips × Bake Dukan'

/** Sets the browser tab title, e.g. "Menu | BurChips × Bake Dukan". */
export function usePageTitle(title?: string) {
  useEffect(() => {
    document.title = title ? `${title} | ${SITE}` : `${SITE} | Order Online · DHA Phase 8, Lahore`
  }, [title])
}
