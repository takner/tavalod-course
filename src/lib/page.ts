import { notFound } from "next/navigation";
import { toAppError } from "@/server/errors";

/** Server-component helper: a missing / foreign resource renders the 404 page instead of an error. */
export async function orNotFound<T>(p: Promise<T>): Promise<T> {
  try {
    return await p;
  } catch (err) {
    if (toAppError(err).code === "NOT_FOUND") notFound();
    throw err;
  }
}
