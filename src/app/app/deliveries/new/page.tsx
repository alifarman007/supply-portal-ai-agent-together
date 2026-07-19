"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { Widget } from "@/components/common/Widget";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RequirePermission } from "@/components/common/RequirePermission";
import { useAcknowledgedPOs, useCreateChallan } from "@/lib/query/hooks";

export default function NewChallanPage() {
  return (
    <RequirePermission permission="manage_deliveries" redirectTo="/app/deliveries">
      <NewChallanForm />
    </RequirePermission>
  );
}

function NewChallanForm() {
  const router = useRouter();
  const { data: eligiblePOs } = useAcknowledgedPOs();
  const createChallan = useCreateChallan();
  const [selectedPOId, setSelectedPOId] = useState("");
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [driverName, setDriverName] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");

  const selectedPO = eligiblePOs?.find((p) => p.id === selectedPOId);

  const onSubmit = async () => {
    if (!selectedPOId || !deliveryDate || !selectedPO) {
      toast.error("Please select a PO and delivery date");
      return;
    }
    try {
      const challan = await createChallan.mutateAsync({
        poId: selectedPO.id,
        poNumber: selectedPO.poNumber,
        deliveryAddress: selectedPO.deliveryAddress,
        scheduledDeliveryDate: new Date(deliveryDate).toISOString(),
        vehicleNumber: vehicleNumber || undefined,
        driverName: driverName || undefined,
        items: selectedPO.items.map((i) => ({
          description: i.description,
          unit: i.unit,
          quantity: i.quantity,
        })),
      });
      toast.success("Delivery challan created", {
        description: `${challan.challanNumber} has been created.`,
      });
      router.push("/app/deliveries");
    } catch {
      toast.error("Failed to create delivery challan");
    }
  };

  return (
    <div className="mx-auto max-w-[1680px] space-y-6">
      <PageHeader
        title="Create Delivery Challan"
        subtitle="Create a delivery challan for goods dispatch"
        actions={
          <Button variant="outline" onClick={() => router.back()}>
            <ArrowLeft className="size-4" /> Back
          </Button>
        }
      />

      <Widget title="Challan Details">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Purchase Order</Label>
            <Select value={selectedPOId} onValueChange={setSelectedPOId}>
              <SelectTrigger>
                <SelectValue placeholder="Select an acknowledged PO…" />
              </SelectTrigger>
              <SelectContent>
                {eligiblePOs?.map((po) => (
                  <SelectItem key={po.id} value={po.id}>
                    {po.poNumber} — {po.buyerDepartment}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedPO && (
            <div className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              Delivery to: <strong className="text-foreground">{selectedPO.deliveryAddress}</strong>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Scheduled Delivery Date</Label>
              <Input
                type="date"
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
                min="2026-06-30"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Vehicle Number</Label>
              <Input
                placeholder="e.g. Dhaka Metro-ga 11-1234"
                value={vehicleNumber}
                onChange={(e) => setVehicleNumber(e.target.value)}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Driver Name</Label>
              <Input
                placeholder="Driver's full name"
                value={driverName}
                onChange={(e) => setDriverName(e.target.value)}
              />
            </div>
          </div>

          {selectedPO && (
            <div>
              <h4 className="mb-2 text-sm font-semibold text-foreground">Items to Deliver</h4>
              <div className="space-y-1.5">
                {selectedPO.items.map((item) => (
                  <div key={item.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                    <span className="text-foreground">{item.description}</span>
                    <span className="tnum text-muted-foreground">
                      {item.quantity.toLocaleString("en-IN")} {item.unit}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Button
            className="w-full gap-2 bg-brand-red text-white hover:bg-brand-red-600"
            disabled={createChallan.isPending || !selectedPOId || !deliveryDate}
            onClick={onSubmit}
          >
            {createChallan.isPending ? (
              <><Loader2 className="size-4 animate-spin" /> Creating…</>
            ) : (
              "Create Delivery Challan"
            )}
          </Button>
        </div>
      </Widget>
    </div>
  );
}
