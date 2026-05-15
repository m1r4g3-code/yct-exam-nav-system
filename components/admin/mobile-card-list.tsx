"use client"

import React from "react"
import { Skeleton } from "@/components/ui/skeleton"

interface MobileCardListProps<TData> {
  items: TData[]
  renderCard: (item: TData, index: number) => React.ReactNode
  isLoading?: boolean
  skeletonCount?: number
}

export function MobileCardList<TData>({
  items,
  renderCard,
  isLoading = false,
  skeletonCount = 3,
}: MobileCardListProps<TData>) {
  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        {Array.from({ length: skeletonCount }).map((_, index) => (
          <div
            key={index}
            className="space-y-2 rounded-lg border border-border bg-card p-4"
          >
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {items.map((item, index) => (
        <div
          key={(item as { id?: string | number }).id ?? index}
          className="rounded-lg border border-border bg-card p-4"
        >
          {renderCard(item, index)}
        </div>
      ))}
    </div>
  )
}
