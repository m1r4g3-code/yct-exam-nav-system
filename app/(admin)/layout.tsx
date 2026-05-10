import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { AdminShell } from "./admin-shell"

export const dynamic = "force-dynamic"

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/login")

  const role = (user.app_metadata?.role as string) ?? ""
  if (role !== "admin" && role !== "superadmin") redirect("/dashboard")

  return (
    <AdminShell user={{ email: user.email!, role }}>
      {children}
    </AdminShell>
  )
}
