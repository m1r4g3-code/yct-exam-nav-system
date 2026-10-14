"use client"

import { AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { errorMessage } from "@/lib/fetcher"

interface ErrorStateProps {
  error: unknown
  onRetry?: () => void
  title?: string
}

/** Shown in place of a list when its query fails, so a failure never looks like "no data". */
export function ErrorState({ error, onRetry, title = "Couldn't load this list" }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <AlertCircle className="size-10 text-destructive/70" />
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="max-w-md text-xs text-muted-foreground">{errorMessage(error)}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  )
}
