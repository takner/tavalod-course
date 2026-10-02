import type { Toman } from "@/domain/money";

/**
 * Price sources are pluggable and independent of the rest of the app: a failing or missing
 * provider only means "no automatic price". Today only manual entry exists. An automatic source
 * (for example Torob) may be added here once suitable, permitted API access has been confirmed;
 * until then it is NOT enabled and must not be presented as working.
 */
export interface PriceQuote {
  amount: Toman;
  observedAt: Date;
  source: string;
  sourceUrl: string | null;
}

export interface PriceProvider {
  id: string;
  label: string;
  enabled: boolean;
  /** Whether this provider understands the given product URL. */
  supports(url: string): boolean;
  /** Fetch a quote. Implementations must use safeFetchText (SSRF-protected) for any network access. */
  quote(url: string): Promise<PriceQuote | null>;
}

export const manualProvider: PriceProvider = {
  id: "manual",
  label: "ثبت دستی",
  enabled: true,
  supports: () => false,
  quote: async () => null,
};

export const PRICE_PROVIDERS: PriceProvider[] = [manualProvider];

export function automaticProviderFor(url: string): PriceProvider | null {
  return PRICE_PROVIDERS.find((p) => p.enabled && p.id !== "manual" && p.supports(url)) ?? null;
}

export const PRICE_SOURCE_LABELS: Record<string, string> = {
  manual: "ثبت دستی",
  store_page: "صفحه فروشگاه (دیده‌شده توسط کاربر)",
  receipt: "رسید خرید",
};
