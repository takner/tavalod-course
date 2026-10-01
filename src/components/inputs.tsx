"use client";

import { useState } from "react";
import { formatToman, toAsciiDigits, toPersianDigits } from "@/domain/money";
import { formatJalaliDate, isoToJalaliParts, JALALI_MONTHS, jalaliDaysInMonth, jalaliPartsToIso, todayIso } from "@/lib/format";

/** Normalises typed text (Persian/Arabic digits, separators) to an ASCII digit string. */
export function cleanDigits(text: string): string {
  return toAsciiDigits(text).replace(/[^0-9]/g, "").replace(/^0+(?=\d)/, "");
}

/** Money input: accepts Persian or Latin digits, shows the parsed amount under the field. */
export function AmountInput({
  value,
  onChange,
  id,
  name,
  label,
  required,
  autoFocus,
}: {
  value: string;
  onChange: (digits: string) => void;
  id: string;
  name?: string;
  label?: string;
  required?: boolean;
  autoFocus?: boolean;
}) {
  const display = value ? new Intl.NumberFormat("fa-IR").format(BigInt(value)) : "";
  return (
    <div>
      {label && (
        <label htmlFor={id} className="label">
          {label}
        </label>
      )}
      <div className="relative">
        <input
          id={id}
          inputMode="numeric"
          autoComplete="off"
          className="input pl-14 text-lg tabular"
          value={display}
          required={required}
          autoFocus={autoFocus}
          onChange={(e) => onChange(cleanDigits(e.target.value).slice(0, 16))}
        />
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted">تومان</span>
      </div>
      {name && <input type="hidden" name={name} value={value} />}
      {value && <p className="hint">{formatToman(BigInt(value))}</p>}
    </div>
  );
}

/** Jalali (Solar Hijri) date picker that produces an ISO Gregorian "YYYY-MM-DD" value. */
export function JalaliDateInput({
  value,
  onChange,
  name,
  label,
  id,
  allowEmpty,
}: {
  value: string | null;
  onChange?: (iso: string | null) => void;
  name?: string;
  label?: string;
  id: string;
  allowEmpty?: boolean;
}) {
  const [iso, setIso] = useState<string | null>(value);
  const parts = iso ? isoToJalaliParts(iso) : null;
  const current = isoToJalaliParts(todayIso());
  const years = Array.from({ length: 7 }, (_, i) => current.y - 4 + i);

  const update = (next: string | null) => {
    setIso(next);
    onChange?.(next);
  };
  const set = (y: number, m: number, d: number) => update(jalaliPartsToIso(y, m, Math.min(d, jalaliDaysInMonth(y, m))));
  const base = parts ?? current;

  return (
    <fieldset>
      {label && (
        <legend id={`${id}-legend`} className="label">
          {label}
        </legend>
      )}
      {allowEmpty && !parts ? (
        <button type="button" className="btn-secondary w-full" onClick={() => set(current.y, current.m, current.d)}>
          انتخاب تاریخ
        </button>
      ) : (
        <div className="flex gap-2" aria-labelledby={label ? `${id}-legend` : undefined}>
          <select
            aria-label="روز"
            className="input"
            value={base.d}
            onChange={(e) => set(base.y, base.m, Number(e.target.value))}
          >
            {Array.from({ length: jalaliDaysInMonth(base.y, base.m) }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>
                {toPersianDigits(d)}
              </option>
            ))}
          </select>
          <select
            aria-label="ماه"
            className="input"
            value={base.m}
            onChange={(e) => set(base.y, Number(e.target.value), base.d)}
          >
            {JALALI_MONTHS.map((label, i) => (
              <option key={label} value={i + 1}>
                {label}
              </option>
            ))}
          </select>
          <select
            aria-label="سال"
            className="input"
            value={base.y}
            onChange={(e) => set(Number(e.target.value), base.m, base.d)}
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {toPersianDigits(y)}
              </option>
            ))}
          </select>
          {allowEmpty && (
            <button type="button" className="btn-ghost shrink-0 px-2" onClick={() => update(null)} aria-label="حذف تاریخ">
              ✕
            </button>
          )}
        </div>
      )}
      {iso && <p className="hint">{formatJalaliDate(iso)}</p>}
      {name && <input type="hidden" name={name} value={iso ?? ""} />}
    </fieldset>
  );
}
