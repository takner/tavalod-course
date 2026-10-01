"use client";

import { openDB, type IDBPDatabase } from "idb";

/**
 * Per-account offline queue. Each user gets their own IndexedDB database (`tavalod-<userId>`), so
 * signing out or switching accounts can drop exactly that user's data, and one account can never
 * read another's queued operations.
 */
export type QueuedOpType = "expense.create" | "settlement.create";

export interface QueuedOp {
  clientKey: string;
  type: QueuedOpType;
  groupId: string;
  /** Short human description shown in the pending list ("شام — ۴۵۰٬۰۰۰ تومان"). */
  label: string;
  payload: unknown;
  createdAt: number;
  attempts: number;
  /** null while waiting; set when the server rejected it permanently. */
  error: { code: string; message: string } | null;
}

const DB_PREFIX = "tavalod-";
const STORE = "ops";

export function dbNameFor(userId: string): string {
  return `${DB_PREFIX}${userId}`;
}

async function open(userId: string): Promise<IDBPDatabase> {
  return openDB(dbNameFor(userId), 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "clientKey" });
    },
  });
}

export function newClientKey(): string {
  return `c_${crypto.randomUUID().replace(/-/g, "")}`;
}

export async function enqueue(userId: string, op: Omit<QueuedOp, "createdAt" | "attempts" | "error">): Promise<void> {
  const db = await open(userId);
  await db.put(STORE, { ...op, createdAt: Date.now(), attempts: 0, error: null } satisfies QueuedOp);
  db.close();
}

export async function listQueued(userId: string): Promise<QueuedOp[]> {
  const db = await open(userId);
  const all = (await db.getAll(STORE)) as QueuedOp[];
  db.close();
  return all.sort((a, b) => a.createdAt - b.createdAt);
}

export async function removeQueued(userId: string, clientKey: string): Promise<void> {
  const db = await open(userId);
  await db.delete(STORE, clientKey);
  db.close();
}

export async function updateQueued(userId: string, op: QueuedOp): Promise<void> {
  const db = await open(userId);
  await db.put(STORE, op);
  db.close();
}

/** Deletes the queue of every account except `keepUserId` (pass null to delete all). */
export async function purgeOtherAccounts(keepUserId: string | null): Promise<void> {
  if (typeof indexedDB === "undefined" || typeof indexedDB.databases !== "function") return;
  const dbs = await indexedDB.databases();
  await Promise.all(
    dbs
      .map((d) => d.name)
      .filter((name): name is string => !!name && name.startsWith(DB_PREFIX) && name !== (keepUserId ? dbNameFor(keepUserId) : ""))
      .map(
        (name) =>
          new Promise<void>((resolve) => {
            const req = indexedDB.deleteDatabase(name);
            req.onsuccess = req.onerror = req.onblocked = () => resolve();
          }),
      ),
  );
}

export async function deleteAccountQueue(userId: string): Promise<void> {
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(dbNameFor(userId));
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
}

// ───────────────────────── network ─────────────────────────

export class NetworkError extends Error {}

export interface SyncResultWire {
  clientKey: string;
  ok: boolean;
  id?: string;
  replayed?: boolean;
  status?: string;
  retryable?: boolean;
  error?: { code: string; message: string };
}

/** Sends ops to the server. Throws NetworkError when the request did not get an answer. */
export async function sendOps(
  expectedUserId: string,
  ops: Pick<QueuedOp, "clientKey" | "type" | "payload">[],
): Promise<SyncResultWire[]> {
  let res: Response;
  try {
    res = await fetch("/api/sync", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ ops: ops.map(({ clientKey, type, payload }) => ({ clientKey, type, payload })) }),
    });
  } catch {
    throw new NetworkError("offline");
  }
  if (res.status >= 500 && res.status !== 503) throw new NetworkError(`server ${res.status}`);
  const body = (await res.json().catch(() => null)) as
    | { userId?: string; results?: SyncResultWire[]; error?: { code: string; message: string } }
    | null;
  if (!body) throw new NetworkError("bad response");
  if (body.error) {
    if (body.error.code === "UNAUTHENTICATED") throw new SessionMismatchError(body.error.message);
    throw new NetworkError(body.error.message);
  }
  // Never apply results meant for another account (e.g. the user switched accounts mid-flight).
  if (body.userId !== expectedUserId) throw new SessionMismatchError("حساب کاربری تغییر کرده است.");
  return body.results ?? [];
}

export class SessionMismatchError extends Error {}
