import { Card, Field, Select } from "../components/ui";
import { setNumberFormat, type NumberFormat } from "../lib/numberFormat";
import { useNumberFormat } from "../lib/useNumberFormat";

// Changing the format remounts the page (see Layout), which would drop Config
// back on its first tab; this flag sends it back here instead.
let resume = false;
export function consumeResumeTab() {
  const back = resume;
  resume = false;
  return back ? ("preferencias" as const) : null;
}

export default function Preferences() {
  const format = useNumberFormat();
  return (
    <div className="max-w-xl space-y-4">
      <h2 className="text-lg font-semibold">Preferências</h2>
      <Card className="p-5">
        <Field label="Formato numérico">
          <Select
            value={format}
            onChange={(e) => {
              resume = true;
              setNumberFormat(e.target.value as NumberFormat);
            }}
          >
            <option value="comma">1.099,55</option>
            <option value="dot">1,099.55</option>
          </Select>
        </Field>
      </Card>
    </div>
  );
}
