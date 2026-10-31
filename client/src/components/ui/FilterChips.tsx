export interface FilterChip {
  key: string;
  label: string;
  onRemove: () => void;
}

// Lab 4 ui-spec.md §4: a filter that arrives from a dashboard card (for example
// "Active tickets") has no control of its own on the page, so it is shown as a
// chip the user can remove, and "Clear filters" removes all of them.
export function FilterChips({ chips }: { chips: FilterChip[] }) {
  if (chips.length === 0) return null;
  return (
    <ul className="zen-chip-list" aria-label="Applied filters">
      {chips.map((chip) => (
        <li key={chip.key} className="zen-chip">
          <span>{chip.label}</span>
          <button type="button" className="zen-chip-remove" onClick={chip.onRemove} aria-label={`Remove filter: ${chip.label}`}>
            <span aria-hidden="true">×</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
