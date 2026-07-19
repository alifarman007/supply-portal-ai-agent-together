"use client";

import { useState } from "react";
import { Edit3, Save, X } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { Widget } from "@/components/common/Widget";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSupplierProfile, useUpdateProfile } from "@/lib/query/hooks";
import { usePermission } from "@/lib/rbac";

export default function ProfilePage() {
  const { data: profile, isLoading } = useSupplierProfile();
  const updateProfile = useUpdateProfile();
  const canManageProfile = usePermission("manage_profile");
  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState<Record<string, string>>({});

  const startEdit = () => {
    if (!profile) return;
    setFormData({
      primaryContactName: profile.primaryContactName,
      primaryContactPhone: profile.primaryContactPhone,
      primaryContactEmail: profile.primaryContactEmail,
      phone: profile.phone,
      email: profile.email,
      website: profile.website ?? "",
    });
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setFormData({});
  };

  const saveEdit = async () => {
    try {
      await updateProfile.mutateAsync(formData);
      toast.success("Profile updated successfully");
      setEditing(false);
    } catch {
      toast.error("Failed to update profile");
    }
  };

  if (isLoading || !profile) {
    return (
      <div className="mx-auto max-w-[1680px] space-y-6">
        <Skeleton className="h-10 w-64 rounded-lg" />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-48 rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1680px] space-y-6">
      <PageHeader
        title="Company Profile"
        subtitle="Your registered company information and bank details"
        actions={
          editing ? (
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={cancelEdit}>
                <X className="size-4" /> Cancel
              </Button>
              <Button
                onClick={saveEdit}
                disabled={updateProfile.isPending}
                className="gap-2 bg-brand-red text-white hover:bg-brand-red-600"
              >
                <Save className="size-4" />
                {updateProfile.isPending ? "Saving…" : "Save Changes"}
              </Button>
            </div>
          ) : (
            canManageProfile && (
              <Button variant="outline" onClick={startEdit} className="gap-2">
                <Edit3 className="size-4" /> Edit Profile
              </Button>
            )
          )
        }
      />

      {/* Company Info */}
      <Widget title="Company Information">
        <div className="grid gap-4 sm:grid-cols-2">
          {[
            ["Company Name (EN)", profile.companyName],
            ["Company Name (BN)", profile.companyNameBn],
            ["TIN Number", profile.tinNumber],
            ["BIN Number (VAT Reg.)", profile.binNumber],
            ["Trade License No.", profile.tradeLicenseNo],
            ["Incorporation Type", profile.incorporationType],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
              <dd className="tnum mt-0.5 font-semibold text-foreground">{value}</dd>
            </div>
          ))}
          <div className="sm:col-span-2">
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Registered Address</dt>
            <dd className="mt-0.5 font-semibold text-foreground">{profile.registeredAddress}</dd>
          </div>
        </div>
      </Widget>

      {/* Bank Details */}
      <Widget title="Bank Account Details">
        <div className="grid gap-4 sm:grid-cols-2">
          {[
            ["Bank Name", profile.bankName],
            ["Branch", profile.bankBranch],
            ["Account Holder", profile.accountHolderName],
            ["Account Number", profile.accountNumber],
            ["Routing Number", profile.routingNumber],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
              <dd className="tnum mt-0.5 font-semibold text-foreground">{value}</dd>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          Bank details are managed by Kazi Farms Group procurement. Contact your account manager to update banking information.
        </p>
      </Widget>

      {/* Contact Details */}
      <Widget title="Contact Information">
        {editing ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              { key: "primaryContactName", label: "Primary Contact Name" },
              { key: "primaryContactPhone", label: "Primary Contact Phone" },
              { key: "primaryContactEmail", label: "Primary Contact Email" },
              { key: "phone", label: "Company Phone" },
              { key: "email", label: "Company Email" },
              { key: "website", label: "Website" },
            ].map(({ key, label }) => (
              <div key={key} className="space-y-1.5">
                <Label>{label}</Label>
                <Input
                  value={formData[key] ?? ""}
                  onChange={(e) => setFormData((prev) => ({ ...prev, [key]: e.target.value }))}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              ["Primary Contact", profile.primaryContactName],
              ["Contact Phone", profile.primaryContactPhone],
              ["Contact Email", profile.primaryContactEmail],
              ["Company Phone", profile.phone],
              ["Company Email", profile.email],
              ["Website", profile.website ?? "—"],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
                <dd className="mt-0.5 font-semibold text-foreground">{value}</dd>
              </div>
            ))}
          </div>
        )}
      </Widget>
    </div>
  );
}
