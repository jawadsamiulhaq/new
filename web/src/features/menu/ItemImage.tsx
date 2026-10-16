import type { Brand } from '../../lib/api'
import { categoryIcon } from './categoryIcon'

interface ItemImageProps {
  name: string
  categoryName: string
  imageUrl: string | null
  brand: Brand
  className?: string
}

/** The item photo, or a branded placeholder tile until the owner uploads one. */
export function ItemImage({ name, categoryName, imageUrl, brand, className = '' }: ItemImageProps) {
  if (imageUrl) {
    return <img src={imageUrl} alt={name} loading="lazy" className={`object-cover ${className}`} />
  }

  const dukan = brand === 'BakeDukan'
  return (
    <div
      aria-hidden
      className={`relative grid place-items-center overflow-hidden bg-charcoal ${className}`}
      style={{
        backgroundImage: `radial-gradient(circle at 30% 20%, ${dukan ? 'rgb(232 160 191 / 0.18)' : 'rgb(242 194 48 / 0.16)'}, transparent 60%)`,
      }}
    >
      {categoryIcon([name, categoryName], {
        className: `size-1/2 ${dukan ? 'text-dukan' : 'text-mustard'}`,
        strokeWidth: 1.5,
      })}
    </div>
  )
}
