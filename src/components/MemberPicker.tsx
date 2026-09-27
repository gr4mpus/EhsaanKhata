"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Avatar } from "@/components/Avatar";
import type { Member } from "@/lib/types";

const ALL = "__all__";

/** Brutalist multi-select for group members, with a "Select all" row and full keyboard support. */
export function MemberPicker({
  members,
  value,
  onChange,
  placeholder,
  invalid,
}: {
  members: Member[];
  value: string[];
  onChange: (userIds: string[]) => void;
  placeholder: string;
  invalid?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  // Row 0 is "Select all"; rows 1..n are members.
  const rows = [ALL, ...members.map((m) => m.user_id)];
  const allSelected = members.length > 0 && members.every((m) => value.includes(m.user_id));
  const selected = members.filter((m) => value.includes(m.user_id));

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  function toggle(row: string) {
    if (row === ALL) onChange(allSelected ? [] : members.map((m) => m.user_id));
    else onChange(value.includes(row) ? value.filter((id) => id !== row) : [...value, row]);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        setActive(0);
        setOpen(true);
      }
      return;
    }
    if (e.key === "ArrowDown") setActive((i) => (i + 1) % rows.length);
    else if (e.key === "ArrowUp") setActive((i) => (i - 1 + rows.length) % rows.length);
    else if (e.key === "Home") setActive(0);
    else if (e.key === "End") setActive(rows.length - 1);
    else if (e.key === " " || e.key === "Enter") toggle(rows[active]);
    else if (e.key === "Escape" || e.key === "Tab") {
      setOpen(false);
      return;
    } else return;
    e.preventDefault();
  }

  const summary = allSelected
    ? `Everyone (${members.length})`
    : selected.map((m) => m.profiles.display_name).join(", ");

  return (
    <div ref={rootRef} className="relative" onKeyDown={onKeyDown}>
      <button
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        aria-invalid={invalid}
        onClick={() => setOpen((o) => !o)}
        className={`input flex items-center gap-3 text-left ${invalid ? "bg-bad-soft" : ""}`}
      >
        {selected.length > 0 ? (
          <>
            <span className="flex shrink-0 -space-x-2">
              {selected.slice(0, 4).map((m) => (
                <Avatar key={m.user_id} name={m.profiles.display_name} avatar={m.profiles.avatar} size={28} />
              ))}
            </span>
            <span className="flex-1 truncate font-bold">{summary}</span>
          </>
        ) : (
          <span className="flex-1 text-muted">{placeholder}</span>
        )}
        <span aria-hidden className={`text-sm font-bold transition-transform ${open ? "rotate-180" : ""}`}>
          ▼
        </span>
      </button>

      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-multiselectable
          className="absolute right-0 left-0 z-20 mt-2 max-h-72 overflow-auto rounded-md border-2 border-ink bg-surface p-1 shadow-[4px_4px_0_var(--ink)]"
        >
          {rows.map((row, i) => {
            const member = members.find((m) => m.user_id === row);
            const checked = row === ALL ? allSelected : value.includes(row);
            return (
              <li
                key={row}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={checked}
                onPointerEnter={() => setActive(i)}
                onClick={() => toggle(row)}
                className={`flex cursor-pointer items-center gap-3 rounded px-3 py-2 ${i === active ? "bg-accent text-[#111]" : ""} ${
                  row === ALL ? "mb-1 border-b-2 border-ink" : ""
                }`}
              >
                <span
                  aria-hidden
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 border-ink text-xs font-bold ${
                    checked ? "bg-ink text-surface" : "bg-surface"
                  }`}
                >
                  {checked && "✓"}
                </span>
                {member ? (
                  <>
                    <Avatar name={member.profiles.display_name} avatar={member.profiles.avatar} size={28} />
                    <span className="flex-1 truncate font-medium">{member.profiles.display_name}</span>
                  </>
                ) : (
                  <span className="flex-1 font-bold">Select all</span>
                )}
              </li>
            );
          })}
          <li role="presentation" className="p-1">
            <button type="button" className="btn w-full py-1.5 text-sm" onClick={() => setOpen(false)}>
              Done
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}
