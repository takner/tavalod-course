"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  enqueue,
  listQueued,
  NetworkError,
  purgeOtherAccounts,
  removeQueued,
  sendOps,
  SessionMismatchError,
  updateQueued,
  type QueuedOp,
  type QueuedOpType,
} from "@/lib/offline/queue";

export type SubmitOutcome =
  | { kind: "saved"; id: string; status?: string }
  | { kind: "queued" }
  | { kind: "rejected"; message: string; code: string };

interface SyncContextValue {
  userId: string;
  pending: QueuedOp[];
  online: boolean;
  /** Queues the op locally first, then tries to send it right away. */
  submit: (op: { clientKey: string; type: QueuedOpType; groupId: string; label: string; payload: unknown }) => Promise<SubmitOutcome>;
  discard: (clientKey: string) => Promise<void>;
  flush: () => Promise<void>;
}

const SyncContext = createContext<SyncContextValue | null>(null);

export function useSync(): SyncContextValue {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error("useSync must be used inside SyncProvider");
  return ctx;
}

const RETRY_MS = 20_000;

export function SyncProvider({ userId, children }: { userId: string; children: React.ReactNode }) {
  const router = useRouter();
  const [pending, setPending] = useState<QueuedOp[]>([]);
  const [online, setOnline] = useState(true);
  const flushing = useRef<Promise<void> | null>(null);

  const reload = useCallback(async () => {
    try {
      setPending(await listQueued(userId));
    } catch {
      setPending([]);
    }
  }, [userId]);

  const flush = useCallback(async () => {
    if (flushing.current) return flushing.current;
    const run = (async () => {
      const queued = (await listQueued(userId)).filter((op) => !op.error);
      if (queued.length === 0) return;
      try {
        const results = await sendOps(userId, queued);
        let changed = false;
        for (const r of results) {
          const op = queued.find((q) => q.clientKey === r.clientKey);
          if (!op) continue;
          if (r.ok) {
            await removeQueued(userId, op.clientKey);
            changed = true;
          } else if (!r.retryable && r.error) {
            await updateQueued(userId, { ...op, attempts: op.attempts + 1, error: r.error });
          } else {
            await updateQueued(userId, { ...op, attempts: op.attempts + 1 });
          }
        }
        setOnline(true);
        if (changed) router.refresh();
      } catch (err) {
        if (err instanceof NetworkError) setOnline(false);
        if (err instanceof SessionMismatchError) {
          // The browser now holds a different session; this queue must not be sent under it.
          router.refresh();
        }
      } finally {
        await reload();
      }
    })();
    flushing.current = run;
    try {
      await run;
    } finally {
      flushing.current = null;
    }
  }, [userId, reload, router]);

  useEffect(() => {
    // Only the signed-in account's queue may exist on this device.
    void purgeOtherAccounts(userId).then(reload).then(flush);
    const goOnline = () => {
      setOnline(true);
      void flush();
    };
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    const timer = window.setInterval(() => void flush(), RETRY_MS);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      window.clearInterval(timer);
    };
  }, [userId, flush, reload]);

  const submit = useCallback<SyncContextValue["submit"]>(
    async (op) => {
      await enqueue(userId, op);
      await reload();
      try {
        const [r] = await sendOps(userId, [op]);
        setOnline(true);
        if (r?.ok) {
          await removeQueued(userId, op.clientKey);
          await reload();
          return { kind: "saved", id: r.id!, status: r.status };
        }
        if (r && !r.retryable && r.error) {
          // A definitive rejection: nothing was saved, so the form keeps the user's input.
          await removeQueued(userId, op.clientKey);
          await reload();
          return { kind: "rejected", message: r.error.message, code: r.error.code };
        }
        return { kind: "queued" };
      } catch (err) {
        if (err instanceof NetworkError) setOnline(false);
        if (err instanceof SessionMismatchError) {
          await removeQueued(userId, op.clientKey);
          await reload();
          return { kind: "rejected", message: err.message, code: "UNAUTHENTICATED" };
        }
        return { kind: "queued" };
      }
    },
    [userId, reload],
  );

  const discard = useCallback(
    async (clientKey: string) => {
      await removeQueued(userId, clientKey);
      await reload();
    },
    [userId, reload],
  );

  const value = useMemo(() => ({ userId, pending, online, submit, discard, flush }), [userId, pending, online, submit, discard, flush]);
  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}
