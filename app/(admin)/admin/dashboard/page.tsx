"use client"

import { useQuery } from "@tanstack/react-query"
import { Users, GraduationCap, DoorOpen, CalendarRange } from "lucide-react"
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
    <Card className="bg-zinc-900 border-zinc-800">
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-sm text-zinc-400">{label}</p>
            {isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <p className="text-3xl font-bold text-zinc-50">{value}</p>
            )}
          </div>
          <div className="rounded-md bg-zinc-800 p-2">
            <Icon className="size-5 text-zinc-400" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-zinc-50">Dashboard</h1>
        <p className="mt-0.5 text-sm text-zinc-400">Overview of the exam portal</p>
      </div>

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
  )
}
