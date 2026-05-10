import { Badge } from "@/components/ui/badge"

interface StatusBadgeProps {
  status: "DRAFT" | "PUBLISHED"
}

export function StatusBadge({ status }: StatusBadgeProps) {
  if (status === "PUBLISHED") {
    return (
      <Badge className="border-emerald-500/30 bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/20">
        Published
      </Badge>
    )
  }

  return (
    <Badge variant="outline" className="border-zinc-700 text-zinc-400">
      Draft
    </Badge>
  )
}
