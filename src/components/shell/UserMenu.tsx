"use client";

import { useRouter } from "next/navigation";
import { LogOut, Settings, User as UserIcon, UserCog } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/store/auth";
import { useLabels } from "@/lib/i18n/labels";
import type { SupplierRole } from "@/lib/mock/types";

const ROLES: SupplierRole[] = ["supplier_admin", "finance_officer", "logistics_officer", "viewer"];

const ROLE_LABELS: Record<SupplierRole, string> = {
  supplier_admin: "Admin",
  finance_officer: "Finance",
  logistics_officer: "Logistics",
  viewer: "Viewer",
};

export function UserMenu() {
  const router = useRouter();
  const user = useAuth((s) => s.user);
  const activeRole = useAuth((s) => s.activeRole);
  const setActiveRole = useAuth((s) => s.setActiveRole);
  const logout = useAuth((s) => s.logout);
  const { t } = useLabels();

  if (!user) return null;

  const onLogout = () => {
    logout();
    router.push("/login");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 rounded-full py-1 pr-2 pl-1 transition-colors hover:bg-muted/50"
        >
          <Avatar className="size-8 border border-border">
            <AvatarFallback className="bg-primary text-xs font-bold text-primary-foreground">
              {user.initials}
            </AvatarFallback>
          </Avatar>
          <span className="hidden flex-col items-start leading-tight md:flex">
            <span className="text-sm font-semibold text-foreground">{user.name}</span>
            <span className="text-[11px] text-muted-foreground">
              {ROLE_LABELS[activeRole]}
            </span>
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>
          <div className="flex flex-col">
            <span>{user.name}</span>
            <span className="text-xs font-normal text-muted-foreground">{user.email}</span>
            <span className="mt-0.5 text-[11px] font-normal text-muted-foreground/80">
              {user.companyName}
            </span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <UserCog />
            <span>
              {t("acting_as")}: <span className="font-medium">{ROLE_LABELS[activeRole]}</span>
            </span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup
              value={activeRole}
              onValueChange={(v) => setActiveRole(v as SupplierRole)}
            >
              {ROLES.map((r) => (
                <DropdownMenuRadioItem key={r} value={r}>
                  {ROLE_LABELS[r]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuItem onClick={() => router.push("/app/profile")}>
          <UserIcon />
          {t("profile")}
        </DropdownMenuItem>
        <DropdownMenuItem>
          <Settings />
          {t("settings")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={onLogout}>
          <LogOut />
          {t("logout")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
