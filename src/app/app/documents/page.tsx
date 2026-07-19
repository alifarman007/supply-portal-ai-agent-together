"use client";

import { Upload, Download, FileCheck, FileWarning, FileX, FileQuestion, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { StatusPill } from "@/components/common/StatusPill";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useDocuments } from "@/lib/query/hooks";
import { formatDate } from "@/lib/format/date";
import { usePermission } from "@/lib/rbac";
import type { DocumentType } from "@/lib/mock/types";

const DOC_ICONS: Record<DocumentType, typeof FileCheck> = {
  trade_license: ShieldCheck,
  tin_certificate: FileCheck,
  vat_registration: FileCheck,
  bank_solvency: FileCheck,
  iso_certification: FileCheck,
};

const DOC_LABELS: Record<DocumentType, string> = {
  trade_license: "Trade License",
  tin_certificate: "TIN Certificate",
  vat_registration: "VAT Registration (BIN)",
  bank_solvency: "Bank Solvency Certificate",
  iso_certification: "ISO Certification",
};

export default function DocumentsPage() {
  const { data: docs, isLoading } = useDocuments();
  const canUpload = usePermission("upload_documents");

  const expired = docs?.filter((d) => d.status === "expired") ?? [];
  const expiring = docs?.filter((d) => d.status === "expiring_soon") ?? [];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Compliance Documents"
        subtitle="Manage your company's compliance documents and certifications"
      />

      {expired.length > 0 && (
        <Alert className="border-danger/30 bg-danger/10 text-danger">
          <FileX className="size-4" />
          <AlertDescription>
            <strong>{expired.length} document{expired.length > 1 ? "s" : ""} expired:</strong>{" "}
            {expired.map((d) => DOC_LABELS[d.type]).join(", ")}. Please upload updated documents immediately.
          </AlertDescription>
        </Alert>
      )}

      {expiring.length > 0 && (
        <Alert className="border-warn/30 bg-warn/10 text-warn">
          <FileWarning className="size-4" />
          <AlertDescription>
            <strong>{expiring.length} document{expiring.length > 1 ? "s" : ""} expiring soon:</strong>{" "}
            {expiring.map((d) => DOC_LABELS[d.type]).join(", ")}. Please renew before expiry.
          </AlertDescription>
        </Alert>
      )}

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {docs?.map((doc) => {
            const Icon = DOC_ICONS[doc.type] ?? FileQuestion;
            return (
              <div key={doc.id} className="glass p-5">
                <div className="flex items-start gap-3">
                  <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">
                    <Icon className="size-5" strokeWidth={1.75} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-semibold text-foreground">{DOC_LABELS[doc.type]}</h3>
                      <StatusPill status={doc.status} />
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">No. {doc.documentNumber}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{doc.issuingAuthority}</p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">Issued</span>
                    <div className="font-medium text-foreground">{formatDate(doc.issuedDate)}</div>
                  </div>
                  <div>
                    <span className={doc.status === "expired" ? "text-danger" : doc.status === "expiring_soon" ? "text-warn" : "text-muted-foreground"}>
                      Expires
                    </span>
                    <div className={`font-medium ${doc.status === "expired" ? "text-danger" : doc.status === "expiring_soon" ? "text-warn" : "text-foreground"}`}>
                      {formatDate(doc.expiryDate)}
                    </div>
                  </div>
                  {doc.uploadedAt && (
                    <div className="col-span-2">
                      <span className="text-muted-foreground">Uploaded: </span>
                      <span className="text-foreground">{formatDate(doc.uploadedAt)}</span>
                      <span className="ml-2 text-muted-foreground">{doc.fileSize}</span>
                    </div>
                  )}
                </div>

                <div className="mt-4 flex gap-2">
                  {canUpload && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 gap-1.5"
                      onClick={() => toast.info("Upload functionality coming soon.")}
                    >
                      <Upload className="size-3.5" /> Upload New
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 gap-1.5"
                    onClick={() => toast.info("Download functionality coming soon.")}
                  >
                    <Download className="size-3.5" /> Download
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
