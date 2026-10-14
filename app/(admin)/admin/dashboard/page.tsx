"use client"

import { useSyncExternalStore } from "react"
import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import {
  Users,
  GraduationCap,
  DoorOpen,
  CalendarRange,
  ArrowRight,
  FileSpreadsheet,
  LayoutList,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { apiGet, errorMessage } from "@/lib/fetcher"
import { QUERY_KEYS } from "@/lib/query-keys"

interface Stats {
  students: number
  courses: number
  activeHalls: number
  activeSessions: number
}

interface StatCardProps {
  label: string
  value: number | string
  icon: React.ElementType
  isLoading: boolean
}

function StatCard({ label, value, icon: Icon, isLoading }: StatCardProps) {
  return (
    <Card className="bg-card border-border">
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">{label}</p>
            {isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <p className="text-3xl font-bold text-foreground">{value}</p>
            )}
          </div>
          <div className="rounded-md bg-brand/10 p-2">
            <Icon className="size-5 text-brand" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

const QUICK_ACTIONS = [
  {
    label: "Generate Timetable",
    description: "Run DSatur scheduler",
    href: "/admin/timetable",
    icon: CalendarRange,
  },
  {
    label: "Import Courses",
    description: "Upload CSV or add manually",
    href: "/admin/courses",
    icon: FileSpreadsheet,
  },
  {
    label: "Manage Halls",
    description: "Configure exam venues",
    href: "/admin/halls",
    icon: DoorOpen,
  },
  {
    label: "View Students",
    description: "Browse and manage students",
    href: "/admin/students",
    icon: LayoutList,
  },
]

function getGreeting(now: Date): string {
  const hour = now.getHours()
  if (hour < 12) return "Good morning"
  if (hour < 17) return "Good afternoon"
  return "Good evening"
}

const noopSubscribe = () => () => {}

/** false during server rendering and hydration, true afterwards (avoids a time-dependent mismatch). */
function useMounted(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false)
}

export default function DashboardPage() {
  const mounted = useMounted()
  const { data: stats, isLoading, isError, error, refetch } = useQuery({
    queryKey: QUERY_KEYS.STATS,
    queryFn: () => apiGet<Stats>("/api/stats"),
  })

  const now = mounted ? new Date() : null
  const greeting = now ? getGreeting(now) : "Welcome"
  const today = now
    ? now.toLocaleDateString("en-NG", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "\u00a0"

  return (
    <div className="space-y-8">
      {/* Welcome header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-foreground">{greeting}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{today}</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand/10 text-brand text-xs font-medium px-3 py-1">
          <span className="size-1.5 rounded-full bg-brand animate-pulse" />
          Portal Active
        </span>
      </div>

      {/* Stat cards */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
          Overview
        </p>
        {isError && (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
            <p className="text-sm text-destructive">
              Couldn&apos;t load the figures: {errorMessage(error)}
            </p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Try again
            </Button>
          </div>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Total Students"
            value={stats?.students ?? "—"}
            icon={Users}
            isLoading={isLoading}
          />
          <StatCard
            label="Total Courses"
            value={stats?.courses ?? "—"}
            icon={GraduationCap}
            isLoading={isLoading}
          />
          <StatCard
            label="Active Halls"
            value={stats?.activeHalls ?? "—"}
            icon={DoorOpen}
            isLoading={isLoading}
          />
          <StatCard
            label="Active Sessions"
            value={stats?.activeSessions ?? "—"}
            icon={CalendarRange}
            isLoading={isLoading}
          />
        </div>
      </div>

      {/* Quick actions */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
          Quick Actions
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {QUICK_ACTIONS.map(({ label, description, href, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="group flex items-center gap-4 rounded-xl border border-border bg-card px-5 py-4 transition-colors hover:border-brand/40 hover:bg-brand/5"
            >
              <div className="shrink-0 rounded-lg bg-muted p-2.5 transition-colors group-hover:bg-brand/10">
                <Icon className="size-5 text-muted-foreground transition-colors group-hover:text-brand" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
              </div>
              <ArrowRight className="size-4 text-muted-foreground/40 transition-colors group-hover:text-brand shrink-0" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
