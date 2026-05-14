"use client"

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
import { QUERY_KEYS } from "@/lib/query-keys"

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

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return "Good morning"
  if (hour < 17) return "Good afternoon"
  return "Good evening"
}

export default function DashboardPage() {
  const { data: studentsData, isLoading: studentsLoading } = useQuery({
    queryKey: QUERY_KEYS.STUDENTS,
    queryFn: async () => {
      const res = await fetch("/api/students")
      if (!res.ok) throw new Error(`${res.status}`)
      const json = await res.json()
      return json.data ?? { total: 0 }
    },
  })

  const { data: coursesData, isLoading: coursesLoading } = useQuery({
    queryKey: QUERY_KEYS.COURSES(undefined),
    queryFn: async () => {
      const res = await fetch("/api/courses")
      if (!res.ok) throw new Error(`${res.status}`)
      const json = await res.json()
      return json.data ?? []
    },
  })

  const { data: hallsData, isLoading: hallsLoading } = useQuery({
    queryKey: QUERY_KEYS.HALLS,
    queryFn: async () => {
      const res = await fetch("/api/halls")
      if (!res.ok) throw new Error(`${res.status}`)
      const json = await res.json()
      return json.data ?? []
    },
  })

  const studentCount =
    typeof studentsData?.total === "number"
      ? studentsData.total
      : Array.isArray(studentsData)
      ? studentsData.length
      : 0

  const courseCount = Array.isArray(coursesData)
    ? coursesData.length
    : (coursesData?.total ?? 0)

  const activeHallCount = Array.isArray(hallsData)
    ? hallsData.filter((h: { isActive?: boolean }) => h.isActive !== false).length
    : 0

  const today = new Date().toLocaleDateString("en-NG", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  })

  return (
    <div className="space-y-8">
      {/* Welcome header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-foreground">{getGreeting()}</h1>
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Total Students"
            value={studentCount}
            icon={Users}
            isLoading={studentsLoading}
          />
          <StatCard
            label="Total Courses"
            value={courseCount}
            icon={GraduationCap}
            isLoading={coursesLoading}
          />
          <StatCard
            label="Active Halls"
            value={activeHallCount}
            icon={DoorOpen}
            isLoading={hallsLoading}
          />
          <StatCard
            label="Active Sessions"
            value={1}
            icon={CalendarRange}
            isLoading={false}
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
