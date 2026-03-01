"use client";

import { useState } from "react";

export type PaymentHoldInfo = {
  hold_id: string;
  amount: number;
  seller_amount: number;
  helper_amount: number;
  has_helper: boolean;
  status: "held" | "released";
};

type Step = "hold" | "gateway" | "to_seller" | "to_helper" | "complete";

export function PaymentGatewayFlow({
  paymentHold,
  participantNames,
  isBuyer,
  onRelease,
  releasing,
}: {
  paymentHold: PaymentHoldInfo;
  participantNames: { seller?: string; helper?: string };
  isBuyer: boolean;
  onRelease: () => Promise<void>;
  releasing: boolean;
}) {
  const [flowStarted, setFlowStarted] = useState(false);
  const [currentStep, setCurrentStep] = useState<Step | null>(null);
  const [released, setReleased] = useState(paymentHold.status === "released");

  const runFlowThenRelease = async () => {
    if (releasing || released) return;
    setFlowStarted(true);

    const steps: Step[] = ["hold", "gateway", "to_seller", ...(paymentHold.has_helper ? ["to_helper"] : []), "complete"];
    for (const step of steps) {
      setCurrentStep(step);
      await new Promise((r) => setTimeout(r, step === "gateway" ? 800 : 500));
    }

    await onRelease();
    setReleased(true);
    setCurrentStep("complete");
  };

  const formatMoney = (n: number) => `$${n.toFixed(2)}`;

  return (
    <div className="rounded-lg border border-stone-200 bg-stone-50/80 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-stone-800">Payment gateway</h3>
        {released && (
          <span className="rounded bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">Completed</span>
        )}
      </div>

      {/* Flow diagram: Buyer → Gateway → Seller (and Helper) */}
      <div className="space-y-3">
        {/* Row 1: Hold on buyer */}
        <div
          className={`flex items-center gap-2 rounded border px-3 py-2 transition-colors ${
            currentStep !== null || released ? "border-amber-300 bg-amber-50" : "border-stone-200 bg-white"
          }`}
        >
          <span className="text-xs font-medium text-stone-500">1</span>
          <span className="text-sm">Funds held on buyer</span>
          <span className="ml-auto text-sm font-medium text-stone-700">{formatMoney(paymentHold.amount)}</span>
        </div>

        {/* Row 2: Gateway */}
        <div className="flex justify-center">
          <div
            className={`rounded border px-3 py-2 transition-colors ${
              currentStep === "gateway" ||
              currentStep === "to_seller" ||
              currentStep === "to_helper" ||
              currentStep === "complete" ||
              released
                ? "border-emerald-400 bg-emerald-50"
                : "border-stone-200 bg-white"
            }`}
          >
            <span className="text-xs font-medium text-stone-500">2</span>{" "}
            <span className="text-sm font-medium">SellinSeconds Gateway</span>
            <span className="ml-2 text-xs text-stone-500">
              {released ? "Complete" : currentStep === "gateway" ? "Processing…" : "Processing"}
            </span>
          </div>
        </div>

        {/* Row 3: Transfers */}
        <div className="grid gap-2 sm:grid-cols-2">
          <div
            className={`rounded border px-3 py-2 transition-colors ${
              currentStep === "to_seller" ||
              currentStep === "to_helper" ||
              currentStep === "complete" ||
              released
                ? "border-emerald-300 bg-emerald-50/80"
                : "border-stone-200 bg-white"
            }`}
          >
            <span className="text-xs font-medium text-stone-500">3a</span>{" "}
            <span className="text-sm">→ Seller{participantNames.seller ? ` (${participantNames.seller})` : ""}</span>
            <span className="mt-1 block text-sm font-medium text-stone-700">{formatMoney(paymentHold.seller_amount)}</span>
          </div>
          {paymentHold.has_helper ? (
            <div
              className={`rounded border px-3 py-2 transition-colors ${
                currentStep === "to_helper" || currentStep === "complete" || released
                  ? "border-emerald-300 bg-emerald-50/80"
                  : "border-stone-200 bg-white"
              }`}
            >
              <span className="text-xs font-medium text-stone-500">3b</span>{" "}
              <span className="text-sm">→ Helper{participantNames.helper ? ` (${participantNames.helper})` : ""}</span>
              <span className="mt-1 block text-sm font-medium text-stone-700">{formatMoney(paymentHold.helper_amount)}</span>
            </div>
          ) : (
            <div className="rounded border border-stone-100 bg-stone-50/50 px-3 py-2">
              <span className="text-xs text-stone-400">No helper</span>
            </div>
          )}
        </div>
      </div>

      {isBuyer && !released && (
        <div className="mt-4">
          <button
            type="button"
            onClick={runFlowThenRelease}
            disabled={releasing}
            className="w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {releasing ? "Processing…" : flowStarted ? "Completing…" : "Release payment via gateway"}
          </button>
        </div>
      )}

      {!isBuyer && !released && (
        <p className="mt-3 text-xs text-stone-500">Waiting for buyer to release payment.</p>
      )}
    </div>
  );
}
