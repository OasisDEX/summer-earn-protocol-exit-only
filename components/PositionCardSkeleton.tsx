import { type FC } from 'react'
import { SkeletonLine } from '@/components/ui'

import classNames from './PositionCard.module.css'

// Mirrors PositionCard's DOM shape 1:1 (same classes, same slots) so the loading state occupies
// exactly the same space as the loaded row - no layout shift when the real data lands.
export const PositionCardSkeleton: FC = () => {
  return (
    <div className={classNames.positionCard}>
      <div className={classNames.titleBlock}>
        <SkeletonLine circle width={44} height={44} />
        <div className={classNames.titleText}>
          <SkeletonLine width={140} height={20} />
        </div>
      </div>

      <div className={classNames.valueBlock}>
        <div className={classNames.amounts}>
          <SkeletonLine width={90} height={20} style={{ alignSelf: 'flex-end' }} />
          <SkeletonLine width={60} height={14} style={{ alignSelf: 'flex-end' }} />
        </div>
        <SkeletonLine width={64} height={36} radius="var(--radius-roundish)" />
      </div>
    </div>
  )
}
