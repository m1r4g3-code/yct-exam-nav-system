import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { StudentShell } from "./student-shell"

export const dynamic = "force-dynamic"

export default async function StudentLayout({
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
  if (role !== "student") redirect("/admin/dashboard")

  return (
    <StudentShell user={{ email: user.email! }}>
      {children}
    </StudentShell>
  )
}
