"use client"

import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Eye, EyeOff, Loader2 } from "lucide-react"
import { z } from "zod"

import { QUERY_KEYS } from "@/lib/query-keys"
import { ApiError, apiGet, apiSend, errorMessage } from "@/lib/fetcher"
import { MATRIC_FORMAT_HINT, isValidMatric, normaliseMatric } from "@/lib/matric"
import { ConfirmDialog } from "@/components/admin/confirm-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

/** The fields of a student record the admin actions need (list rows and the detail page both have them). */
export interface StudentRecord {
  id: string
  fullName: string
  matricNumber: string
  email: string
  departmentId: string
  programmeId: string
  levelId: string
}

interface Department {
  id: string
  name: string
  code: string
  school?: { name: string; code: string } | null
}
interface Programme { id: string; name: string; code: string }
interface Level { id: string; name: string; year: number }

type EditField = "fullName" | "matricNumber" | "email" | "levelId"
type FieldErrors = Partial<Record<EditField, string>>

const EDIT_FIELDS: readonly EditField[] = ["fullName", "matricNumber", "email", "levelId"]
const isEditField = (field: string): field is EditField =>
  (EDIT_FIELDS as readonly string[]).includes(field)

const emailSchema = z.string().trim().email()

function departmentLabel(d: Department): string {
  const school = d.school?.code || d.school?.name
  return school ? `${d.name} (${school})` : d.name
}

/** Trigger text for a select whose options may still be loading — never the raw id. */
function optionLabel(label: string | undefined, value: string, loading: boolean): string | undefined {
  if (label) return label
  if (!value) return undefined
  return loading ? "Loading…" : "—"
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return <p className="text-xs text-destructive mt-1">{message}</p>
}

/**
 * After any change: student lists and detail pages, and the dashboard's student count.
 * A deleted student's own detail page is left alone (it is being left, not refreshed).
 */
function useRefreshStudents() {
  const queryClient = useQueryClient()
  return (deletedId?: string) => {
    queryClient.invalidateQueries({
      queryKey: QUERY_KEYS.STUDENTS,
      predicate: (query) => !deletedId || !query.queryKey.includes(deletedId),
    })
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.STATS })
  }
}

// ── Edit ─────────────────────────────────────────────────────────────────────

function EditStudentForm({ student, onDone }: { student: StudentRecord; onDone: () => void }) {
  const refresh = useRefreshStudents()
  const [fullName, setFullName] = useState(student.fullName)
  const [matricNumber, setMatricNumber] = useState(student.matricNumber)
  const [email, setEmail] = useState(student.email)
  const [departmentId, setDepartmentId] = useState(student.departmentId)
  const [programmeId, setProgrammeId] = useState(student.programmeId)
  const [levelId, setLevelId] = useState(student.levelId)
  const [errors, setErrors] = useState<FieldErrors>({})

  const departmentsQuery = useQuery({
    queryKey: QUERY_KEYS.DEPARTMENTS(),
    queryFn: () => apiGet<Department[]>("/api/departments"),
    staleTime: 5 * 60 * 1000,
  })
  const programmesQuery = useQuery({
    queryKey: QUERY_KEYS.PROGRAMMES(departmentId),
    queryFn: () => apiGet<Programme[]>(`/api/programmes?department_id=${encodeURIComponent(departmentId)}`),
    enabled: !!departmentId,
    staleTime: 5 * 60 * 1000,
  })
  const levelsQuery = useQuery({
    queryKey: QUERY_KEYS.LEVELS(programmeId),
    queryFn: () => apiGet<Level[]>(`/api/levels?programme_id=${encodeURIComponent(programmeId)}`),
    enabled: !!programmeId,
    staleTime: 5 * 60 * 1000,
  })
  const departments = departmentsQuery.data ?? []
  const programmes = programmesQuery.data ?? []
  const levels = levelsQuery.data ?? []
  const selectedDepartment = departments.find((d) => d.id === departmentId)

  const save = useMutation({
    mutationFn: () =>
      apiSend(`/api/students/${encodeURIComponent(student.id)}`, "PUT", {
        fullName: fullName.trim(),
        matricNumber: normaliseMatric(matricNumber),
        email: email.trim(),
        levelId,
      }),
    onSuccess: ({ message }) => {
      refresh()
      toast.success(message || "Student updated")
      onDone()
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        const next: FieldErrors = {}
        for (const fieldError of err.errors ?? []) {
          if (isEditField(fieldError.field)) next[fieldError.field] = fieldError.message
        }
        if (err.status === 409) {
          if (/matric/i.test(err.message)) next.matricNumber = err.message
          else if (/email/i.test(err.message)) next.email = err.message
        }
        setErrors(next)
      }
      toast.error(errorMessage(err))
    },
  })

  function validate(): FieldErrors {
    const next: FieldErrors = {}
    if (fullName.trim().length < 2) next.fullName = "Full name must be at least 2 characters"
    else if (fullName.trim().length > 255) next.fullName = "Full name is too long"
    if (!isValidMatric(matricNumber)) next.matricNumber = MATRIC_FORMAT_HINT
    if (!emailSchema.safeParse(email).success) next.email = "Enter a valid email address"
    if (!levelId) next.levelId = "Select a level"
    return next
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const next = validate()
    setErrors(next)
    if (Object.keys(next).length === 0) save.mutate()
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="edit-fullName">Full name</Label>
        <Input
          id="edit-fullName"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          aria-invalid={!!errors.fullName}
        />
        <FieldError message={errors.fullName} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="edit-matric">Matric number</Label>
        <Input
          id="edit-matric"
          value={matricNumber}
          onChange={(e) => setMatricNumber(e.target.value)}
          autoCapitalize="characters"
          spellCheck={false}
          aria-invalid={!!errors.matricNumber}
        />
        <FieldError message={errors.matricNumber} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="edit-email">Email</Label>
        <Input
          id="edit-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={!!errors.email}
        />
        {errors.email ? (
          <FieldError message={errors.email} />
        ) : (
          <p className="text-xs text-muted-foreground mt-1">The student signs in with this email.</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="edit-department">Department</Label>
        <Select
          value={departmentId || null}
          onValueChange={(v) => {
            if (v == null || v === departmentId) return
            setDepartmentId(v)
            setProgrammeId("")
            setLevelId("")
          }}
          disabled={departmentsQuery.isPending}
        >
          <SelectTrigger id="edit-department" className="w-full">
            <SelectValue placeholder={departmentsQuery.isPending ? "Loading…" : "Select a department"}>
              {optionLabel(
                selectedDepartment && departmentLabel(selectedDepartment),
                departmentId,
                departmentsQuery.isPending
              )}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {departments.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {departmentLabel(d)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {departmentsQuery.isError && <FieldError message={errorMessage(departmentsQuery.error)} />}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="edit-programme">Programme</Label>
          <Select
            value={programmeId || null}
            onValueChange={(v) => {
              if (v == null || v === programmeId) return
              setProgrammeId(v)
              setLevelId("")
            }}
            disabled={!departmentId || programmesQuery.isPending}
          >
            <SelectTrigger id="edit-programme" className="w-full">
              <SelectValue placeholder={!departmentId ? "Select a department first" : "Select a programme"}>
                {optionLabel(
                  programmes.find((p) => p.id === programmeId)?.name,
                  programmeId,
                  programmesQuery.isPending
                )}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {programmes.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {programmesQuery.isError && <FieldError message={errorMessage(programmesQuery.error)} />}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="edit-level">Level</Label>
          <Select
            value={levelId || null}
            onValueChange={(v) => {
              if (v != null) setLevelId(v)
            }}
            disabled={!programmeId || levelsQuery.isPending}
          >
            <SelectTrigger id="edit-level" className="w-full" aria-invalid={!!errors.levelId}>
              <SelectValue placeholder={!programmeId ? "Select a programme first" : "Select a level"}>
                {optionLabel(levels.find((l) => l.id === levelId)?.name, levelId, levelsQuery.isPending)}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {levels.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {levelsQuery.isError ? (
            <FieldError message={errorMessage(levelsQuery.error)} />
          ) : (
            <FieldError message={errors.levelId} />
          )}
        </div>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={save.isPending}>
          Cancel
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
          Save changes
        </Button>
      </DialogFooter>
    </form>
  )
}

// ── Reset password ───────────────────────────────────────────────────────────

function ResetPasswordForm({ student, onDone }: { student: StudentRecord; onDone: () => void }) {
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [show, setShow] = useState(false)
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({})

  const reset = useMutation({
    mutationFn: () =>
      apiSend(`/api/students/${encodeURIComponent(student.id)}/reset-password`, "POST", { password }),
    onSuccess: ({ message }) => {
      toast.success(message || "Password updated", {
        description: `Give the new password to ${student.fullName} privately.`,
      })
      onDone()
    },
    onError: (err) => toast.error(errorMessage(err)),
  })

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const next: { password?: string; confirm?: string } = {}
    if (password.length < 8) next.password = "Password must be at least 8 characters"
    else if (password.length > 72) next.password = "Password is too long"
    if (confirm !== password) next.confirm = "Passwords do not match"
    setErrors(next)
    if (Object.keys(next).length === 0) reset.mutate()
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="reset-password">New password</Label>
        <div className="relative">
          <Input
            id="reset-password"
            type={show ? "text" : "password"}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={!!errors.password}
            className="pr-10"
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            aria-label={show ? "Hide password" : "Show password"}
          >
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
        <FieldError message={errors.password} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="reset-confirm">Confirm new password</Label>
        <Input
          id="reset-confirm"
          type={show ? "text" : "password"}
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          aria-invalid={!!errors.confirm}
        />
        <FieldError message={errors.confirm} />
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={reset.isPending}>
          Cancel
        </Button>
        <Button type="submit" disabled={reset.isPending}>
          {reset.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
          Set password
        </Button>
      </DialogFooter>
    </form>
  )
}

// ── All three actions ────────────────────────────────────────────────────────

type Action = { kind: "edit" | "reset" | "delete"; student: StudentRecord }

/**
 * Edit / Reset password / Delete for a student, shared by the Students list and a
 * student's detail page. Render `dialogs` once; call the returned functions to open one.
 */
export function useStudentActions({ onDeleted }: { onDeleted?: (student: StudentRecord) => void } = {}) {
  const refresh = useRefreshStudents()
  const [action, setAction] = useState<Action | null>(null)
  const [open, setOpen] = useState(false)

  const show = (kind: Action["kind"]) => (student: StudentRecord) => {
    setAction({ kind, student })
    setOpen(true)
  }
  const close = () => setOpen(false)

  const remove = useMutation({
    mutationFn: (student: StudentRecord) =>
      apiSend(`/api/students/${encodeURIComponent(student.id)}`, "DELETE"),
    onSuccess: ({ message }, student) => {
      refresh(student.id)
      // The server still reports success when only the sign-in account couldn't be removed.
      if (/could not be removed/i.test(message)) toast.warning(message)
      else toast.success(message || "Student deleted")
      setOpen(false)
      onDeleted?.(student)
    },
    onError: (err) => toast.error(errorMessage(err)),
  })

  const student = action?.student
  const formOpen = open && (action?.kind === "edit" || action?.kind === "reset")

  const dialogs = (
    <>
      <Dialog open={formOpen} onOpenChange={(next) => !next && close()}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{action?.kind === "reset" ? "Reset password" : "Edit student"}</DialogTitle>
            <DialogDescription>
              {student
                ? action?.kind === "reset"
                  ? `Set a new sign-in password for ${student.fullName} (${student.matricNumber}).`
                  : `${student.fullName} · ${student.matricNumber}`
                : null}
            </DialogDescription>
          </DialogHeader>
          {student && formOpen && action?.kind === "edit" && (
            <EditStudentForm key={student.id} student={student} onDone={close} />
          )}
          {student && formOpen && action?.kind === "reset" && (
            <ResetPasswordForm key={student.id} student={student} onDone={close} />
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={open && action?.kind === "delete"}
        onOpenChange={(next) => {
          if (!next && !remove.isPending) close()
        }}
        title={student ? `Delete ${student.fullName}?` : "Delete student?"}
        description={
          student
            ? `This permanently removes ${student.matricNumber}, their course enrolments and exam seats, and their sign-in account. This cannot be undone.`
            : ""
        }
        confirmLabel="Delete student"
        loading={remove.isPending}
        onConfirm={() => student && remove.mutate(student)}
      />
    </>
  )

  return {
    edit: show("edit"),
    resetPassword: show("reset"),
    remove: show("delete"),
    dialogs,
  }
}
