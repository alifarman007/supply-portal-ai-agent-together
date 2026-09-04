"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus, Trash2, Loader2 } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { RequirePermission } from "@/components/common/RequirePermission";
import { useAcknowledgedPOs, useCreateInvoice } from "@/lib/query/hooks";
import { formatBDT } from "@/lib/format/money";
import { VAT_RATE, AIT_RATE, calcVAT, calcAIT } from "@/lib/format/tax";

interface LineItem {
  description: string;
  unit: string;
  quantity: number;
  unitPrice: number;
}

export default function NewInvoicePage() {
  return (
    <RequirePermission permission="manage_invoices" redirectTo="/app/invoices">
      <NewInvoiceForm />
    </RequirePermission>
  );
}

function NewInvoiceForm() {
  const router = useRouter();
  const { data: eligiblePOs } = useAcknowledgedPOs();
  const createInvoice = useCreateInvoice();
  const [selectedPOId, setSelectedPOId] = useState("");
  const [remarks, setRemarks] = useState("");
  const [items, setItems] = useState<LineItem[]>([
    { description: "", unit: "pcs", quantity: 1, unitPrice: 0 },
  ]);

  const selectedPO = eligiblePOs?.find((p) => p.id === selectedPOId);

  const onSelectPO = (poId: string) => {
    setSelectedPOId(poId);
    const po = eligiblePOs?.find((p) => p.id === poId);
    if (po) {
      setItems(
        po.items.map((i) => ({
          description: i.description,
          unit: i.unit,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
        })),
      );
    }
  };

  const updateItem = (idx: number, field: keyof LineItem, value: string | number) => {
    setItems((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, [field]: value } : item)),
    );
  };

  const addItem = () => {
    setItems((prev) => [...prev, { description: "", unit: "pcs", quantity: 1, unitPrice: 0 }]);
  };

  const removeItem = (idx: number) => {
    if (items.length === 1) return;
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const subtotal = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const vatAmount = calcVAT(subtotal);
  const aitAmount = calcAIT(subtotal);
  const totalAmount = subtotal + vatAmount - aitAmount;

  const onSubmit = async () => {
    if (!selectedPOId || !selectedPO) {
      toast.error("Please select a purchase order");
      return;
    }
    if (items.some((i) => !i.description || i.quantity <= 0 || i.unitPrice <= 0)) {
      toast.error("Please fill in all line items");
      return;
    }
    try {
      const invoice = await createInvoice.mutateAsync({
        poId: selectedPO.id,
        poNumber: selectedPO.poNumber,
        items,
        remarks,
      });
      toast.success("Invoice submitted", {
        description: `${invoice.invoiceNumber} has been submitted for review.`,
      });
      router.push("/app/invoices");
    } catch {
      toast.error("Failed to submit invoice");
    }
  };

  return (
    <div className="mx-auto max-w-[1680px] space-y-6">
      <PageHeader
        title="Create Invoice"
        subtitle="Submit a new invoice against a purchase order"
        actions={
          <Button variant="outline" onClick={() => router.back()}>
            <ArrowLeft className="size-4" /> Back
          </Button>
        }
      />

      {/* PO Selection */}
      <Widget title="Select Purchase Order">
        <div className="max-w-sm space-y-1.5">
          <Label>Purchase Order</Label>
          <Select value={selectedPOId} onValueChange={onSelectPO}>
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
          {selectedPO && (
            <p className="text-xs text-muted-foreground">
              PO Grand Total: <strong className="text-foreground">{formatBDT(selectedPO.grandTotal)}</strong>
              {" · "}Delivery Due: {selectedPO.requiredDeliveryDate.slice(0, 10)}
            </p>
          )}
        </div>
      </Widget>

      {/* Line Items */}
      <Widget title="Invoice Line Items">
        <div className="space-y-3">
          <div className="hidden grid-cols-[1fr_80px_100px_120px_40px] gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:grid">
            <span>Description</span>
            <span className="text-center">Unit</span>
            <span className="text-right">Qty</span>
            <span className="text-right">Unit Price</span>
            <span />
          </div>
          {items.map((item, idx) => (
            <div key={idx} className="grid gap-2 sm:grid-cols-[1fr_80px_100px_120px_40px]">
              <Input
                placeholder="Description"
                value={item.description}
                onChange={(e) => updateItem(idx, "description", e.target.value)}
              />
              <Input
                placeholder="Unit"
                value={item.unit}
                onChange={(e) => updateItem(idx, "unit", e.target.value)}
                className="text-center"
              />
              <Input
                type="number"
                placeholder="Qty"
                value={item.quantity}
                min={1}
                onChange={(e) => updateItem(idx, "quantity", Number(e.target.value))}
                className="text-right"
              />
              <Input
                type="number"
                placeholder="Unit price"
                value={item.unitPrice}
                min={0}
                onChange={(e) => updateItem(idx, "unitPrice", Number(e.target.value))}
                className="text-right"
              />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeItem(idx)}
                disabled={items.length === 1}
                className="text-muted-foreground hover:text-danger"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
          <Button variant="outline" onClick={addItem} className="gap-2">
            <Plus className="size-4" /> Add Item
          </Button>
        </div>
      </Widget>

      {/* Tax Summary */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Widget title="Remarks">
          <Textarea
            placeholder="Optional remarks or notes for the buyer…"
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            rows={4}
          />
        </Widget>

        <Widget title="Invoice Summary">
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd className="tnum font-semibold text-foreground">{formatBDT(subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">VAT ({(VAT_RATE * 100).toFixed(0)}%)</dt>
              <dd className="tnum text-foreground">+{formatBDT(vatAmount)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">AIT ({(AIT_RATE * 100).toFixed(0)}%)</dt>
              <dd className="tnum text-danger">-{formatBDT(aitAmount)}</dd>
            </div>
            <div className="flex justify-between border-t border-border pt-3 text-base">
              <dt className="font-bold text-foreground">Total Payable</dt>
              <dd className="tnum font-bold text-foreground">{formatBDT(totalAmount)}</dd>
            </div>
          </dl>

          <Button
            className="mt-4 w-full gap-2 bg-brand-red text-white hover:bg-brand-red-600"
            disabled={createInvoice.isPending || !selectedPOId}
            onClick={onSubmit}
          >
            {createInvoice.isPending ? (
              <><Loader2 className="size-4 animate-spin" /> Submitting…</>
            ) : (
              "Submit Invoice"
            )}
          </Button>
        </Widget>
      </div>
    </div>
  );
}
