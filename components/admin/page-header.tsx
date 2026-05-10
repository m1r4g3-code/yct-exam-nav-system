"use client"

import { Button } from "@/components/ui/button"

interface PageHeaderProps {
  title: string
  description?: string
  action?: {
    label: string
    onClick: () => void
  }
}

export function PageHeader({ title, description, action }: PageHeaderProps) {
  return (
    <div className="flex flex-row items-start justify-between">
      <div>
        <h1 className="text-xl font-semibold text-zinc-50">{title}</h1>
        {description && (
          <p className="mt-0.5 text-sm text-zinc-400">{description}</p>
        )}
      </div>
      {action && (
        <Button onClick={action.onClick}>{action.label}</Button>
      )}
    </div>
  )
}
