import { useSyncExternalStore } from "react";
import { getNumberFormat, subscribeNumberFormat } from "./numberFormat";

// Current number format preference; re-renders the caller when it changes.
export const useNumberFormat = () => useSyncExternalStore(subscribeNumberFormat, getNumberFormat);
