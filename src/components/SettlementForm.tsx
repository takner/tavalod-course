"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { previewAllocationAction } from "@/app/actions";
import { formatToman } from "@/domain/money";
import { METHOD_LABELS } from "@/lib/format";
import { newClientKey } from "@/lib/offline/queue";
import type { FormMember } from "./ExpenseForm";
import { AmountInput, cleanDigits } from "./inputs";
import { useSync } from "./SyncProvider";
import { Notice } from "./ui";

interface AllocationRow {
  eventId: string | null;
  amount: string;
}

export function SettlementForm({
  groupId,
  members,
  events,
  isAdmin,
  prefill,
}: {
  groupId: string;
  members: FormMember[];
  events: { id: string; title: string }[];
  isAdmin: boolean;
  prefill?: { from?: string; to?: string; amount?: string };
}) {
  const router = useRouter();
  const { submit } = useSync();
  const me = members.find((m) => m.isMe)!;
  const [clientKey, setClientKey] = useState(() => newClientKey());
  const [from, setFrom] = useState(prefill?.from ?? me.id);
  const [to, setTo] = useState(prefill?.to ?? members.find((m) => m.id !== me.id)?.id ?? "");
  const [amount, setAmount] = useState(prefill?.amount ?? "");
  const [method, setMethod] = useState("bank_transfer");
  const [note, setNote] = useState("");
  const [manual, setManual] = useState(false);
  const [allocations, setAllocations] = useState<AllocationRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const eventTitle = (id: string | null) => (id ? (events.find((e) => e.id === id)?.title ?? "رویداد") : "حساب عمومی گروه");
  const isParty = from === me.id || to === me.id;

  useEffect(() => {
    if (manual || !amount || !from || !to || from === to) return;
    const t = window.setTimeout(async () => {
      try {
        const r = await previewAllocationAction(groupId, from, to, amount);
        if (r.ok) setAllocations(r.allocations);
      } catch {
        // Offline: the server allocates automatically when the queued payment is sent.
      }
    }, 350);
    return () => window.clearTimeout(t);
  }, [groupId, from, to, amount, manual]);

  const allocSum = allocations.reduce((a, x) => a + BigInt(x.amount || "0"), 0n);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!amount || BigInt(amount) <= 0n) return setError("مبلغ را وارد کنید.");
    if (from === to) return setError("پرداخت‌کننده و دریافت‌کننده نباید یکی باشند.");
    if (manual && allocSum !== BigInt(amount)) return setError("جمع تخصیص‌ها باید برابر مبلغ تسویه باشد.");
    const payload = {
      groupId,
      fromMemberId: from,
      toMemberId: to,
      amount,
      method,
      ...(note.trim() ? { note: note.trim() } : {}),
      ...(manual ? { allocations: allocations.filter((a) => a.amount && BigInt(a.amount) > 0n) } : {}),
    };
    const fromName = members.find((m) => m.id === from)?.name;
    const toName = members.find((m) => m.id === to)?.name;
    setBusy(true);
    const outcome = await submit({
      clientKey,
      type: "settlement.create",
      groupId,
      label: `تسویه ${fromName} ← ${toName}: ${formatToman(BigInt(amount))}`,
      payload,
    });
    setBusy(false);
    if (outcome.kind === "rejected") return setError(outcome.message);
    setClientKey(newClientKey());
    if (outcome.kind === "queued") {
      setDone("بدون اینترنت ثبت شد و پس از اتصال ارسال می‌شود.");
    } else if (outcome.status === "confirmed") {
      setDone("تسویه ثبت و تأیید شد.");
    } else {
      setDone("ثبت شد و در انتظار تأیید دریافت‌کننده است. تا تأیید نشود، مانده‌ها تغییر نمی‌کنند.");
    }
    setAmount("");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="from" className="label">
            پرداخت‌کننده
          </label>
          <select id="from" className="input" value={from} onChange={(e) => setFrom(e.target.value)}>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
                {m.isMe ? " (من)" : ""}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="to" className="label">
            دریافت‌کننده
          </label>
          <select id="to" className="input" value={to} onChange={(e) => setTo(e.target.value)}>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
                {m.isMe ? " (من)" : ""}
              </option>
            ))}
          </select>
        </div>
      </div>
      {!isParty && !isAdmin && <Notice tone="warning">فقط پرداخت‌کننده، دریافت‌کننده یا مدیر گروه می‌تواند تسویه ثبت کند.</Notice>}

      <AmountInput id="settle-amount" label="مبلغ" value={amount} onChange={setAmount} required />

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="method" className="label">
            روش
          </label>
          <select id="method" className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
            {Object.entries(METHOD_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="settle-note" className="label">
            توضیح
          </label>
          <input id="settle-note" className="input" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="مثلاً شماره پیگیری" />
        </div>
      </div>

      {amount && allocations.length > 0 && (
        <section className="rounded-xl bg-surface-2 p-3 text-sm">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-medium">این پرداخت کدام حساب‌ها را پوشش می‌دهد؟</span>
            <label className="flex items-center gap-1 text-xs">
              <input type="checkbox" checked={manual} onChange={(e) => setManual(e.target.checked)} />
              تغییر دستی
            </label>
          </div>
          <ul className="space-y-1.5">
            {(manual ? [...allocations, ...events.filter((ev) => !allocations.some((a) => a.eventId === ev.id)).map((ev) => ({ eventId: ev.id, amount: "" })), ...(allocations.some((a) => a.eventId === null) ? [] : [{ eventId: null, amount: "" }])] : allocations).map((a) => (
              <li key={a.eventId ?? "general"} className="flex items-center justify-between gap-2">
                <span className="truncate">{eventTitle(a.eventId)}</span>
                {manual ? (
                  <input
                    aria-label={`تخصیص به ${eventTitle(a.eventId)}`}
                    inputMode="numeric"
                    className="input min-h-9 w-32 tabular"
                    value={a.amount ? new Intl.NumberFormat("fa-IR").format(BigInt(a.amount)) : ""}
                    onChange={(e) => {
                      const v = cleanDigits(e.target.value).slice(0, 16);
                      setAllocations((list) => {
                        const exists = list.some((x) => x.eventId === a.eventId);
                        return exists ? list.map((x) => (x.eventId === a.eventId ? { ...x, amount: v } : x)) : [...list, { eventId: a.eventId, amount: v }];
                      });
                    }}
                  />
                ) : (
                  <span className="tabular">{formatToman(BigInt(a.amount))}</span>
                )}
              </li>
            ))}
          </ul>
          {manual && (
            <p className={`mt-2 text-xs ${allocSum === BigInt(amount) ? "text-muted" : "text-negative"}`}>
              جمع تخصیص: {formatToman(allocSum)} از {formatToman(BigInt(amount))}
            </p>
          )}
        </section>
      )}

      {error && <Notice tone="error">{error}</Notice>}
      {done && <Notice tone="success">{done}</Notice>}
      <button type="submit" className="btn-primary w-full" disabled={busy}>
        {busy ? "در حال ثبت…" : to === me.id ? "دریافت کردم" : from === me.id ? "پرداخت کردم" : "ثبت تسویه"}
      </button>
    </form>
  );
}
