interface Props { value: string; limit: number; }
export function CharCounter({ value, limit }: Props) {
  const over = value.length > limit;
  return <div className={`char-counter ${over ? "over" : ""}`}>{value.length} / {limit}</div>;
}
