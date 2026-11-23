import { num } from "./numberFormat";

// Helpers for the "cents-first" money mask used by MoneyInput: the user types
// only digits and the field fills from the right, like banking apps
// ("1099" -> "10,99", or "10.99" in the "dot" number format). The value
// handed back is always a plain number, whatever the format. Everything here
// is pure so it can be exercised without a DOM.

// More digits than this would lose cent precision in a double.
const MAX_DIGITS = 15;

// A form value (number, numeric string, empty) -> number, or null when empty.
export function toMoneyValue(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

// 1099.55 -> "1.099,55" ("comma") or "1,099.55" ("dot"); null -> "".
export function formatMoneyInput(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "";
  return num(value, 2);
}

// Whatever is in the field after a typed edit -> number: every non-digit is
// dropped and the last two digits are the cents ("10,995" -> 109.95,
// "R$ 1.099,55" -> 1099.55).
// With no significant digit left (only zeros, or nothing) the kind of edit
// decides: an insertion that put a digit there is a deliberate zero ("0" into
// an empty field -> 0, shown "0,00"); a deletion empties the field (null), so
// backspacing "0,00" or "0,05" clears it instead of getting stuck on "0,00".
export function parseMoneyInput(text: string, deletion = false): number | null {
  const digits = text.replace(/\D/g, "").replace(/^0+/, "").slice(0, MAX_DIGITS);
  if (digits) return Number(digits) / 100;
  if (deletion) return null;
  return /\d/.test(text) ? 0 : null;
}

// Pasted text is a real decimal number, not cents-first digits: "250" -> 250,
// "1099.5" -> 1099.5, "1,234.5" -> 1234.5, "1.099,55" -> 1099.55,
// "R$ 1.099" -> 1099. Rounded to cents; null when there is no digit.
// Separator rules: when both '.' and ',' appear, the last one is the decimal
// separator. When only one kind appears, it is a thousands separator if it
// repeats or is followed by exactly 3 digits, otherwise the decimal one.
export function parsePastedMoney(text: string): number | null {
  const cleaned = text.replace(/[^\d.,]/g, "").replace(/[.,]+$/, "");
  if (!/\d/.test(cleaned)) return null;
  const last = Math.max(cleaned.lastIndexOf("."), cleaned.lastIndexOf(","));
  let intPart = cleaned;
  let fracPart = "";
  if (last >= 0) {
    const sep = cleaned[last];
    const mixed = cleaned.includes(".") && cleaned.includes(",");
    const repeated = cleaned.indexOf(sep) !== last;
    const tail = cleaned.slice(last + 1);
    const isDecimal = mixed || (!repeated && tail.length !== 3);
    if (isDecimal) {
      intPart = cleaned.slice(0, last);
      fracPart = tail;
    }
  }
  const intDigits = intPart.replace(/\D/g, "").replace(/^0+/, "").slice(0, MAX_DIGITS - 2);
  const n = Number(`${intDigits || "0"}.${fracPart || "0"}`);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

// Backspace/Delete with a collapsed caret right next to a separator would
// only remove the separator, which the mask puts straight back. Instead the
// nearest digit on that side is removed. Returns the edited text and how many
// digits sit to the right of the caret afterwards (to place it again once the
// value is reformatted), or null when the plain browser edit is fine.
export function deleteAcrossSeparator(
  text: string,
  caret: number,
  key: "Backspace" | "Delete",
): { text: string; digitsRight: number } | null {
  const isDigit = (c: string | undefined) => c !== undefined && /\d/.test(c);
  let at: number;
  if (key === "Backspace") {
    if (caret <= 0 || isDigit(text[caret - 1])) return null;
    at = caret - 1;
    while (at >= 0 && !isDigit(text[at])) at--;
  } else {
    if (caret >= text.length || isDigit(text[caret])) return null;
    at = caret;
    while (at < text.length && !isDigit(text[at])) at++;
  }
  if (at < 0 || at >= text.length) return null;
  const next = text.slice(0, at) + text.slice(at + 1);
  // The caret lands where the removed digit was.
  const digitsRight = next.slice(at).replace(/\D/g, "").length;
  return { text: next, digitsRight };
}

// Caret index in `display` with `digitsRight` digits to its right; the
// rightmost such spot, so it sits next to the digit it belongs to.
export function caretForDigitsRight(display: string, digitsRight: number): number {
  let count = 0;
  for (let i = display.length; i > 0; i--) {
    if (count >= digitsRight) return i;
    if (/\d/.test(display[i - 1])) count++;
  }
  return 0;
}
