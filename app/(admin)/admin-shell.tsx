"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  Building2,
  Building,
  GraduationCap,
  DoorOpen,
  CalendarRange,
  Users,
  LogOut,
} from "lucide-react"
import { ThemeToggle } from "@/components/theme-toggle"

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
  useSidebar,
} from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { useLogout } from "@/hooks/use-user"

const NAV_ITEMS = [
  { label: "Dashboard", href: "/admin/dashboard", icon: LayoutDashboard },
  { label: "Schools", href: "/admin/schools", icon: Building2 },
  { label: "Departments", href: "/admin/departments", icon: Building },
  { label: "Courses", href: "/admin/courses", icon: GraduationCap },
  { label: "Halls", href: "/admin/halls", icon: DoorOpen },
  { label: "Timetable", href: "/admin/timetable", icon: CalendarRange },
  { label: "Students", href: "/admin/students", icon: Users },
] as const

/** Advanced pages: reachable by URL, not listed in the sidebar, but still named in the header. */
const EXTRA_TITLES = [
  { label: "Programmes", href: "/admin/programmes" },
  { label: "Levels", href: "/admin/levels" },
  { label: "Time Slots", href: "/admin/slots" },
] as const

function pageTitle(pathname: string): string {
  return (
    [...NAV_ITEMS, ...EXTRA_TITLES].find((item) => pathname.startsWith(item.href))?.label ??
    "Admin"
  )
}

interface AdminShellProps {
  user: { email: string; role: string }
  /** Initial expanded state of the desktop sidebar (from the `sidebar_state` cookie). */
  defaultOpen?: boolean
  children: React.ReactNode
}

export function AdminShell({ user, defaultOpen = true, children }: AdminShellProps) {
  const pathname = usePathname()
  const activePage = pageTitle(pathname)

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AdminSidebar user={user} pathname={pathname} />

      <SidebarInset>
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
          <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
          <Separator orientation="vertical" className="mx-1 h-4 bg-border" />
          <nav className="flex items-center text-sm text-muted-foreground">
            <span className="text-foreground font-medium">{activePage}</span>
          </nav>
          <div className="ml-auto">
            <ThemeToggle className="text-muted-foreground hover:text-foreground" />
          </div>
        </header>

        <div className="flex-1 bg-background p-4 sm:p-6 md:p-8">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}

/** Rendered inside SidebarProvider so it can close the mobile drawer after navigation. */
function AdminSidebar({ user, pathname }: { user: AdminShellProps["user"]; pathname: string }) {
  const { isMobile, setOpenMobile } = useSidebar()
  const logout = useLogout()

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-3 py-4">
        <div className="flex items-center gap-2 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/yabatech-crest.png"
            alt="Yabatech crest"
            className="size-7 object-contain select-none shrink-0"
          />
          <span className="truncate text-sm font-semibold text-sidebar-foreground group-data-[collapsible=icon]:hidden">
            Exam Portal
          </span>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarMenu className="px-2 py-1 gap-0.5">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname.startsWith(item.href)
            return (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton
                  isActive={isActive}
                  tooltip={item.label}
                  render={<Link href={item.href} />}
                  onClick={() => {
                    if (isMobile) setOpenMobile(false)
                  }}
                  className="gap-3 px-3.5 py-3 text-sm"
                >
                  <item.icon className="size-4 shrink-0" />
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
            onClick={() => void logout()}
            title="Sign out"
          >
            <LogOut className="size-4" />
            <span className="sr-only">Sign out</span>
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
