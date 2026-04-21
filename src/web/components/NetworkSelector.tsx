import { NETWORK_LIST } from "../lib/networks";
import type { Network } from "../../shared/types";

interface Props {
  value: Network[];
  onChange: (nets: Network[]) => void;
}
export function NetworkSelector({ value, onChange }: Props) {
  return (
    <div className="net-selector">
      {NETWORK_LIST.map((n) => {
        const checked = value.includes(n.id);
        return (
          <label key={n.id} className={checked ? "checked" : ""}>
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) =>
                onChange(e.target.checked ? [...value, n.id] : value.filter((x) => x !== n.id))
              }
            />
            {n.label}
          </label>
        );
      })}
    </div>
  );
}
