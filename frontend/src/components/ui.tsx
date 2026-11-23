import {
  useLayoutEffect,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import {
  caretForDigitsRight,
  deleteAcrossSeparator,
  formatMoneyInput,
  parseMoneyInput,
  parsePastedMoney,
  toMoneyValue,
} from "../lib/money";

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "danger";
}) {
  const styles = {
    primary:
      "bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-white",
    ghost:
      "bg-transparent text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800",
    danger: "bg-transparent text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40",
  }[variant];
  return (
    <button
      className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${styles} ${className}`}
      {...props}
    />
  );
}

const fieldClass =
  "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 placeholder-neutral-400 outline-none focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:placeholder-neutral-500 dark:focus:border-neutral-400 dark:focus:ring-neutral-400";

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={fieldClass} {...props} />;
}

// Cents-first money field: typed digits fill from the right ("1099" ->
// "10,99", or "10.99" in the "dot" number format) with the caret kept at the
// end; an edit in the middle keeps it beside the same digits. Focusing selects the whole value so typing replaces it. "0" typed into
// an empty field is a real zero ("0,00"); deleting the last significant digit
// empties it. A paste is read as a decimal number ("250" -> 250,00) and
// replaces the value. onChange hands back a plain number (or null when
// cleared); the formatted text never leaves the component.
export function MoneyInput({
  value,
  onChange,
  placeholder,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> & {
  value: number | string | null | undefined;
  onChange: (value: number | null) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  // Digits to the right of the caret to restore after the next reformat
  // (separator-aware deletion); null = caret at the end.
  const pendingCaret = useRef<number | null>(null);
  // The mousedown that focused the field, so its mouseup can select all.
  const focusingClick = useRef(false);
  const display = formatMoneyInput(toMoneyValue(value));
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || document.activeElement !== el) return;
    const pos =
      pendingCaret.current === null
        ? el.value.length
        : caretForDigitsRight(el.value, pendingCaret.current);
    pendingCaret.current = null;
    el.setSelectionRange(pos, pos);
  }, [display]);
  return (
    <input
      {...props}
      ref={ref}
      className={fieldClass}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      placeholder={placeholder ?? formatMoneyInput(0)}
      value={display}
      onChange={(e) => {
        const el = e.target;
        const inputType = (e.nativeEvent as InputEvent).inputType ?? "";
        const next = parseMoneyInput(el.value, inputType.startsWith("delete"));
        // An edit in the middle keeps the caret next to the same digits once
        // the value is reformatted, so a second Backspace removes the next
        // digit instead of the last cent. At the end it stays at the end.
        const caret = el.selectionStart;
        if (caret !== null && caret < el.value.length) {
          const digitsRight = el.value.slice(caret).replace(/\D/g, "").length;
          const nextDisplay = formatMoneyInput(next);
          if (nextDisplay === display) {
            // No re-render will follow: put the text back and place the caret now.
            el.value = display;
            const pos = caretForDigitsRight(display, digitsRight);
            el.setSelectionRange(pos, pos);
          } else {
            pendingCaret.current = digitsRight;
          }
        }
        onChange(next);
      }}
      onFocus={(e) => {
        props.onFocus?.(e);
        e.currentTarget.select();
      }}
      onMouseDown={(e) => {
        props.onMouseDown?.(e);
        focusingClick.current = document.activeElement !== e.currentTarget;
      }}
      onMouseUp={(e) => {
        props.onMouseUp?.(e);
        if (!focusingClick.current) return;
        focusingClick.current = false;
        const el = e.currentTarget;
        // A plain click collapses the selection made on focus: redo it. A drag
        // started by the focusing click keeps the range the user chose.
        if (el.selectionStart === el.selectionEnd) {
          e.preventDefault();
          el.select();
        }
      }}
      onKeyDown={(e) => {
        props.onKeyDown?.(e);
        if (e.defaultPrevented || (e.key !== "Backspace" && e.key !== "Delete")) return;
        if (e.altKey || e.ctrlKey || e.metaKey) return;
        const el = e.currentTarget;
        if (el.selectionStart === null || el.selectionStart !== el.selectionEnd) return;
        const edit = deleteAcrossSeparator(el.value, el.selectionStart, e.key);
        if (!edit) return;
        e.preventDefault();
        const next = parseMoneyInput(edit.text, true);
        const nextDisplay = formatMoneyInput(next);
        if (nextDisplay === display) {
          const pos = caretForDigitsRight(display, edit.digitsRight);
          el.setSelectionRange(pos, pos);
        } else {
          pendingCaret.current = edit.digitsRight;
        }
        onChange(next);
      }}
      onPaste={(e) => {
        props.onPaste?.(e);
        if (e.defaultPrevented) return;
        e.preventDefault();
        const pasted = parsePastedMoney(e.clipboardData.getData("text"));
        if (pasted !== null) onChange(pasted);
      }}
    />
  );
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={fieldClass} {...props} />;
}

// Compact "Ordenar" selector for page headers: date (default) or name.
export function SortSelect({
  value,
  onChange,
  dateLabel,
}: {
  value: "date" | "name";
  onChange: (value: "date" | "name") => void;
  dateLabel: string;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400">
      Ordenar
      <select
        className={fieldClass.replace("w-full ", "").replace("py-2", "py-1.5")}
        value={value}
        onChange={(e) => onChange(e.target.value as "date" | "name")}
      >
        <option value="date">{dateLabel}</option>
        <option value="name">Nome</option>
      </select>
    </label>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">{label}</span>
      {children}
    </label>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl bg-white shadow-sm ring-1 ring-neutral-200 dark:bg-neutral-900 dark:ring-neutral-800 ${className}`}
    >
      {children}
    </div>
  );
}

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <Card className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto">
        <div onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-4 dark:border-neutral-800">
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">{title}</h2>
            <Button variant="ghost" onClick={onClose} aria-label="Fechar">
              ✕
            </Button>
          </div>
          <div className="p-5">{children}</div>
        </div>
      </Card>
    </div>
  );
}
