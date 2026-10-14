"use client"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

export interface ImportRowError {
  row: number
  reason: string
}

export interface ImportReport {
  imported: number
  updated?: number
  skipped: number
  errors: ImportRowError[]
}

interface ImportReportDialogProps {
  report: ImportReport | null
  onOpenChange: (open: boolean) => void
  title?: string
}

/** Summary of a CSV import: counts plus every rejected row and the reason it was rejected. */
export function ImportReportDialog({
  report,
  onOpenChange,
  title = "Import report",
}: ImportReportDialogProps) {
  const errors = report?.errors ?? []

  return (
    <Dialog open={report !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {errors.length === 0
              ? "Every row in the file was processed."
              : `${errors.length} row${errors.length === 1 ? " was" : "s were"} rejected — fix them in the file and upload it again.`}
          </DialogDescription>
        </DialogHeader>

        {report && (
          <div className="space-y-4">
            <div className={`grid gap-2 ${report.updated !== undefined ? "grid-cols-3" : "grid-cols-2"}`}>
              <ReportCount label="Imported" value={report.imported} />
              {report.updated !== undefined && <ReportCount label="Updated" value={report.updated} />}
              <ReportCount label="Skipped" value={report.skipped} />
            </div>

            {errors.length > 0 && (
              <div className="max-h-64 overflow-y-auto rounded-md border border-border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted">
                    <tr>
                      <th className="w-16 px-3 py-2 text-left font-medium text-muted-foreground">Row</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {errors.map((e, i) => (
                      <tr key={`${e.row}-${i}`} className="border-t border-border">
                        <td className="px-3 py-2 font-mono text-xs text-foreground">{e.row}</td>
                        <td className="px-3 py-2 text-foreground">{e.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ReportCount({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border bg-muted/40 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold text-foreground">{value}</p>
    </div>
  )
}
