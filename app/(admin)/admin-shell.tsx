"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  LayoutDashboard,
  Building2,
  Building,
  BookOpen,
  Layers,
  GraduationCap,
  DoorOpen,
  Clock,
  CalendarRange,
  Users,
  LogOut,
} from "lucide-react"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { createClient } from "@/lib/supabase/client"
import { useQueryClient } from "@tanstack/react-query"

const NAV_ITEMS = [
  { label: "Dashboard", href: "/admin/dashboard", icon: LayoutDashboard },
  { label: "Schools", href: "/admin/schools", icon: Building2 },
  { label: "Departments", href: "/admin/departments", icon: Building },
  { label: "Programmes", href: "/admin/programmes", icon: BookOpen },
  { label: "Levels", href: "/admin/levels", icon: Layers },
  { label: "Courses", href: "/admin/courses", icon: GraduationCap },
  { label: "Halls", href: "/admin/halls", icon: DoorOpen },
  { label: "Time Slots", href: "/admin/slots", icon: Clock },
  { label: "Timetable", href: "/admin/timetable", icon: CalendarRange },
  { label: "Students", href: "/admin/students", icon: Users },
] as const

interface AdminShellProps {
  user: { email: string; role: string }
  children: React.ReactNode
}

export function AdminShell({ user, children }: AdminShellProps) {
  const pathname = usePathname()
  const router = useRouter()
  const queryClient = useQueryClient()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    queryClient.clear()
    router.push("/login")
  }

  const activePage = NAV_ITEMS.find((item) => pathname.startsWith(item.href))?.label ?? "Admin"

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader className="px-3 py-4">
          <div className="flex items-center gap-2 overflow-hidden">
            <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-zinc-50 text-zinc-950">
              <GraduationCap className="size-4" />
            </div>
            <span className="truncate text-sm font-semibold text-sidebar-foreground group-data-[collapsible=icon]:hidden">
              YCT Exam Portal
            </span>
          </div>
        </SidebarHeader>

        <SidebarContent>
          <SidebarMenu className="px-1">
            {NAV_ITEMS.map((item) => {
              const isActive = pathname.startsWith(item.href)
              return (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    isActive={isActive}
                    tooltip={item.label}
                    render={<Link href={item.href} />}
                  >
                    <item.icon />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )
            })}
          </SidebarMenu>
        </SidebarContent>

        <SidebarFooter className="px-1 pb-3">
          <Separator className="mb-2 bg-sidebar-border" />
          <div className="flex items-center gap-2 px-2 py-1 group-data-[collapsible=icon]:justify-center">
            <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
              <p className="truncate text-xs font-medium text-sidebar-foreground">
                {user.email}
              </p>
              <p className="truncate text-xs capitalize text-sidebar-foreground/60">
                {user.role}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              className="shrink-0 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
              onClick={handleLogout}
              title="Sign out"
            >
              <LogOut className="size-4" />
              <span className="sr-only">Sign out</span>
            </Button>
          </div>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset>
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-zinc-800 px-4">
          <SidebarTrigger className="text-zinc-400 hover:text-zinc-50" />
          <Separator orientation="vertical" className="mx-1 h-4 bg-zinc-800" />
          <nav className="flex items-center text-sm text-zinc-400">
            <span className="text-zinc-50 font-medium">{activePage}</span>
          </nav>
        </header>

        <div className="flex-1 bg-zinc-950 p-6">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
