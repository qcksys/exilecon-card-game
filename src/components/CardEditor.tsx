import { Loader2, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import {
    type Card,
    RARITIES,
    type Rarity,
    type ScanResult,
    SLOT_LABEL,
    SLOTS,
    type Slot,
    type SymbolCounts,
} from "../lib/game";
import type { Preset } from "../lib/store";
import { NumberStepper, SymbolPicker } from "./SymbolPicker";

export type Draft = Omit<Card, "id" | "createdAt" | "photoId"> & {
    id?: string;
    createdAt?: number;
    photoId?: string;
};

export const EMPTY_DRAFT: Draft = {
    name: "",
    slot: "weapon",
    twoHanded: false,
    rarity: "normal",
    symbols: {},
    durability: 2,
    damage: 0,
    note: "",
};

export function draftFromScan(scan: ScanResult, base: Draft): Draft {
    const symbols: SymbolCounts = {};
    for (const [k, v] of Object.entries(scan.symbols) as Array<[keyof SymbolCounts, number]>)
        if (v > 0) symbols[k] = v;
    return {
        ...base,
        name: scan.name,
        slot: scan.slot,
        twoHanded: scan.slot === "weapon" && scan.twoHanded,
        rarity: scan.rarity,
        symbols,
        durability: scan.durability || 2,
        note: scan.modifiers.join(", "),
    };
}

const RARITY_STYLE: Record<Rarity, string> = {
    normal: "border-edge text-text",
    magic: "border-magic text-magic",
    rare: "border-rare text-rare",
    unique: "border-unique text-unique",
};

export function CardEditor({
    draft,
    onChange,
    presets,
    photoUrl,
    status,
    uncertain,
    onSave,
    onSaveAndNext,
    onDelete,
    onCancel,
    nextLabel,
}: {
    draft: Draft;
    onChange: (d: Draft) => void;
    presets: Preset[];
    photoUrl?: string;
    status?: { kind: "busy" | "error" | "info"; text: string };
    uncertain: ReadonlySet<string>;
    onSave: () => void;
    onSaveAndNext?: () => void;
    onDelete?: () => void;
    onCancel: () => void;
    nextLabel?: string;
}) {
    const [nameFocus, setNameFocus] = useState(false);
    const suggestions = useMemo(() => {
        const q = draft.name.trim().toLowerCase();
        if (!q) return presets.slice(0, 8);
        return presets
            .filter((p) => p.name.toLowerCase().includes(q) && p.name.toLowerCase() !== q)
            .slice(0, 8);
    }, [draft.name, presets]);

    const applyPreset = (p: Preset) =>
        onChange({
            ...draft,
            name: p.name,
            slot: p.slot,
            twoHanded: p.twoHanded,
            rarity: p.rarity,
            symbols: p.symbols,
        });

    const flag = (field: string) =>
        uncertain.has(field) ? "ring-2 ring-amber-400/70 rounded-xl" : "";
    const valid = draft.name.trim().length > 0;

    return (
        <div className="space-y-4">
            <div className="flex gap-3">
                {photoUrl ? (
                    <img
                        src={photoUrl}
                        alt="Card"
                        className="h-36 w-auto shrink-0 rounded-lg border border-edge object-cover"
                    />
                ) : null}
                <div className="min-w-0 flex-1 space-y-2">
                    {status ? (
                        <div
                            className={`flex items-center gap-2 rounded-lg p-2 text-sm ${
                                status.kind === "error"
                                    ? "bg-bad/15 text-bad"
                                    : status.kind === "busy"
                                      ? "bg-panel-2 text-muted"
                                      : "bg-good/10 text-good"
                            }`}
                        >
                            {status.kind === "busy" ? (
                                <Loader2 size={16} className="animate-spin" />
                            ) : null}
                            {status.text}
                        </div>
                    ) : null}
                    <div className={`relative ${flag("name")}`}>
                        <input
                            className="h-12 w-full rounded-lg border border-edge bg-panel px-3 text-base"
                            placeholder="Card name"
                            value={draft.name}
                            onChange={(e) => {
                                onChange({ ...draft, name: e.target.value });
                                setNameFocus(true);
                            }}
                            onFocus={() => setNameFocus(true)}
                            onClick={() => setNameFocus(true)}
                            onBlur={() => setTimeout(() => setNameFocus(false), 200)}
                            autoComplete="off"
                        />
                        {nameFocus && suggestions.length > 0 ? (
                            <ul className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-edge bg-panel-2 shadow-xl">
                                {suggestions.map((p) => (
                                    <li key={p.name}>
                                        <button
                                            type="button"
                                            className="w-full px-3 py-3 text-left text-sm hover:bg-panel"
                                            // Pick on pointer-down so the input's blur can't hide the list first (touch and mouse).
                                            onPointerDown={(e) => {
                                                e.preventDefault();
                                                applyPreset(p);
                                                setNameFocus(false);
                                            }}
                                            onClick={() => {
                                                applyPreset(p);
                                                setNameFocus(false);
                                            }}
                                        >
                                            {p.name}{" "}
                                            <span className="text-xs text-muted">
                                                {SLOT_LABEL[p.slot]}
                                            </span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        ) : null}
                    </div>
                </div>
            </div>

            <div className={flag("slot")}>
                <div className="mb-1.5 text-xs uppercase tracking-wider text-muted">Slot</div>
                <div className="grid grid-cols-5 gap-1.5">
                    {SLOTS.map((s: Slot) => (
                        <button
                            key={s}
                            type="button"
                            onClick={() =>
                                onChange({
                                    ...draft,
                                    slot: s,
                                    twoHanded: s === "weapon" ? draft.twoHanded : false,
                                })
                            }
                            className={`h-11 rounded-lg border text-sm ${
                                draft.slot === s
                                    ? "border-gold bg-gold text-ink font-semibold"
                                    : "border-edge bg-panel"
                            }`}
                        >
                            {SLOT_LABEL[s]}
                        </button>
                    ))}
                </div>
            </div>

            {draft.slot === "weapon" ? (
                <div className={`grid grid-cols-2 gap-1.5 ${flag("twoHanded")}`}>
                    {[false, true].map((two) => (
                        <button
                            key={String(two)}
                            type="button"
                            onClick={() => onChange({ ...draft, twoHanded: two })}
                            className={`h-11 rounded-lg border text-sm ${
                                draft.twoHanded === two
                                    ? "border-gold bg-panel-2 font-semibold text-gold"
                                    : "border-edge bg-panel"
                            }`}
                        >
                            {two ? "Two-handed" : "One-handed"}
                        </button>
                    ))}
                </div>
            ) : null}

            <div className={flag("rarity")}>
                <div className="mb-1.5 text-xs uppercase tracking-wider text-muted">Rarity</div>
                <div className="grid grid-cols-4 gap-1.5">
                    {RARITIES.map((r) => (
                        <button
                            key={r}
                            type="button"
                            onClick={() => onChange({ ...draft, rarity: r })}
                            className={`h-10 rounded-lg border text-sm capitalize ${RARITY_STYLE[r]} ${
                                draft.rarity === r
                                    ? "bg-panel-2 font-semibold ring-1 ring-current"
                                    : "bg-panel opacity-70"
                            }`}
                        >
                            {r}
                        </button>
                    ))}
                </div>
            </div>

            <div>
                <div className="mb-1.5 text-xs uppercase tracking-wider text-muted">
                    Symbols (include modifier symbols)
                </div>
                <SymbolPicker
                    value={draft.symbols}
                    onChange={(symbols) => onChange({ ...draft, symbols })}
                    highlight={uncertain.has("symbols")}
                />
            </div>

            <div className={`flex flex-wrap gap-4 ${flag("durability")}`}>
                <NumberStepper
                    label="Durability"
                    value={draft.durability}
                    onChange={(n) =>
                        onChange({
                            ...draft,
                            durability: Math.max(1, n),
                            damage: Math.min(draft.damage, Math.max(1, n)),
                        })
                    }
                />
                <NumberStepper
                    label="Damage taken"
                    value={draft.damage}
                    onChange={(n) => onChange({ ...draft, damage: Math.min(n, draft.durability) })}
                />
            </div>

            <input
                className={`h-11 w-full rounded-lg border border-edge bg-panel px-3 text-sm ${flag("modifiers")}`}
                placeholder="Modifiers, Quality or Rune (optional)"
                value={draft.note}
                onChange={(e) => onChange({ ...draft, note: e.target.value })}
            />

            <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                    type="button"
                    disabled={!valid}
                    onClick={onSave}
                    className="h-12 whitespace-nowrap rounded-lg bg-gold px-3 font-semibold text-ink disabled:opacity-40"
                >
                    Save
                </button>
                {onSaveAndNext ? (
                    <button
                        type="button"
                        disabled={!valid}
                        onClick={onSaveAndNext}
                        className="h-12 whitespace-nowrap rounded-lg border border-gold px-3 font-semibold text-gold disabled:opacity-40"
                    >
                        {nextLabel ?? "Save & next"}
                    </button>
                ) : null}
            </div>
            <div className="flex gap-2">
                <button
                    type="button"
                    onClick={onCancel}
                    className="h-11 flex-1 rounded-lg border border-edge px-4"
                >
                    Cancel
                </button>
                {onDelete ? (
                    <button
                        type="button"
                        onClick={onDelete}
                        className="flex h-12 items-center rounded-lg border border-bad/50 px-3 text-bad"
                        aria-label="Delete card"
                    >
                        <Trash2 size={18} />
                    </button>
                ) : null}
            </div>
        </div>
    );
}
