import { Camera, Download, Link2, Minus, PenLine, Plus, Upload } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { type Card, isBroken, newId, ScanResult, SLOT_LABEL, SLOTS } from "../lib/game";
import { preparePhoto } from "../lib/photo";
import { decodeCards, encodeCards, hydrate, strip } from "../lib/share";
import {
    deletePhoto,
    learnPreset,
    loadCards,
    loadPhoto,
    loadPresets,
    type Preset,
    saveCards,
    savePhoto,
} from "../lib/store";
import { TurnstileClient } from "../lib/turnstile-client";
import { CardEditor, type Draft, draftFromScan, EMPTY_DRAFT } from "./CardEditor";
import { SymbolRow } from "./SymbolIcon";

type Status = { kind: "busy" | "error" | "info"; text: string } | undefined;

interface Editing {
    draft: Draft;
    photo?: Blob;
    photoUrl?: string;
    uncertain: Set<string>;
    status: Status;
    mode: "scan" | "manual" | "edit";
    /** Changes every time a form is opened, so the editor scrolls into view. */
    opened: number;
    /** Scan mode: the bot check hasn't passed yet, so only the photo is shown, not the card form. */
    verifying?: boolean;
    /** Cloudflare is showing its "Verify you are human" checkbox. */
    needsTap?: boolean;
}

const RARITY_TEXT: Record<Card["rarity"], string> = {
    normal: "text-text",
    magic: "text-magic",
    rare: "text-rare",
    unique: "text-unique",
};

function useThumb(photoId: string | undefined) {
    const [url, setUrl] = useState<string>();
    useEffect(() => {
        if (!photoId) return;
        let u: string | undefined;
        loadPhoto(photoId).then((b) => {
            if (b) {
                u = URL.createObjectURL(b);
                setUrl(u);
            }
        });
        return () => {
            if (u) URL.revokeObjectURL(u);
        };
    }, [photoId]);
    return url;
}

function DurabilityPips({ card }: { card: Card }) {
    return (
        <span
            className="flex gap-1"
            title={`${card.durability - card.damage} of ${card.durability} durability left`}
        >
            {Array.from({ length: card.durability }, (_, i) => (
                <span
                    // biome-ignore lint/suspicious/noArrayIndexKey: pip position
                    key={i}
                    className={`h-3 w-3 rounded-full border ${i < card.durability - card.damage ? "border-gold bg-gold" : "border-edge bg-transparent"}`}
                />
            ))}
        </span>
    );
}

function CardRow({
    card,
    onEdit,
    onDamage,
}: {
    card: Card;
    onEdit: () => void;
    onDamage: (delta: number) => void;
}) {
    const thumb = useThumb(card.photoId);
    const broken = isBroken(card);
    return (
        <li className={`flex items-center gap-3 p-2.5 ${broken ? "opacity-50" : ""}`}>
            <button
                type="button"
                onClick={onEdit}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
            >
                {thumb ? (
                    <img
                        src={thumb}
                        alt=""
                        className="h-14 w-11 shrink-0 rounded border border-edge object-cover"
                    />
                ) : (
                    <span className="flex h-14 w-11 shrink-0 items-center justify-center rounded border border-edge bg-panel-2 text-[10px] text-muted">
                        {SLOT_LABEL[card.slot]}
                    </span>
                )}
                <span className="min-w-0">
                    <span className={`block truncate font-medium ${RARITY_TEXT[card.rarity]}`}>
                        {card.name}
                        {card.slot === "weapon" && card.twoHanded ? (
                            <span className="ml-1 text-xs text-muted">2H</span>
                        ) : null}
                    </span>
                    <span className="mt-1 block">
                        <SymbolRow symbols={card.symbols} size={20} />
                    </span>
                    {broken ? <span className="text-xs text-bad">Broken</span> : null}
                </span>
            </button>
            <div className="flex flex-col items-end gap-1.5">
                <DurabilityPips card={card} />
                <div className="flex gap-1">
                    <button
                        type="button"
                        onClick={() => onDamage(-1)}
                        disabled={card.damage === 0}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-edge disabled:opacity-25"
                        aria-label={`Repair ${card.name}`}
                    >
                        <Minus size={14} />
                    </button>
                    <button
                        type="button"
                        onClick={() => onDamage(1)}
                        disabled={broken}
                        className="flex h-8 items-center gap-1 rounded-lg border border-bad/50 px-2 text-xs text-bad disabled:opacity-25"
                        aria-label={`Damage ${card.name}`}
                    >
                        <Plus size={12} /> Dmg
                    </button>
                </div>
            </div>
        </li>
    );
}

async function callScan(photo: Blob, token: string): Promise<ScanResult> {
    const form = new FormData();
    form.append("photo", photo, "card.jpg");
    form.append("cf-turnstile-response", token);
    const res = await fetch("/api/scan", { method: "POST", body: form });
    const body = (await res.json().catch(() => null)) as { scan?: unknown; error?: string } | null;
    if (!res.ok) throw new Error(body?.error ?? `Scan failed (${res.status})`);
    return ScanResult.parse(body?.scan);
}

export default function Inventory({
    siteKey,
    scanEnabled,
}: {
    siteKey: string;
    scanEnabled: boolean;
}) {
    const [cards, setCards] = useState<Card[] | null>(null);
    const [presets, setPresets] = useState<Preset[]>([]);
    const [editing, setEditing] = useState<Editing | null>(null);
    const [notice, setNotice] = useState<string>();
    const [pendingImport, setPendingImport] = useState<Card[] | null>(null);
    const cameraInput = useRef<HTMLInputElement>(null);
    const importInput = useRef<HTMLInputElement>(null);
    const turnstileBox = useRef<HTMLDivElement>(null);
    const turnstile = useRef<TurnstileClient | null>(null);
    /** The scan in flight (its `opened` time); 0 once the user cancels or switches to manual entry. */
    const scanSession = useRef(0);
    const editorBox = useRef<HTMLElement>(null);
    const editorKey = editing?.opened ?? 0;

    // Bring the editor into view whenever a new card (or a different card) is opened.
    useEffect(() => {
        if (editorKey) editorBox.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, [editorKey]);

    useEffect(() => {
        loadCards().then(setCards);
        loadPresets().then(setPresets);
        const m = location.hash.match(/^#import=(.+)$/);
        if (m?.[1]) {
            decodeCards(m[1])
                .then(setPendingImport)
                .catch(() => setNotice("That share link couldn't be read."));
        }
    }, []);

    const persist = useCallback(async (next: Card[]) => {
        setCards(next);
        await saveCards(next);
    }, []);

    const closeEditor = () => {
        scanSession.current = 0;
        if (editing?.photoUrl) URL.revokeObjectURL(editing.photoUrl);
        setEditing(null);
    };

    /** Skip the bot check and scan: keep the photo and open the form for manual entry. */
    const fillByHand = () => {
        scanSession.current = 0;
        setEditing((e) => (e ? { ...e, verifying: false, needsTap: false, status: undefined } : e));
    };

    const startScan = () => cameraInput.current?.click();

    const onPhoto = async (file: File | undefined) => {
        if (!file) return;
        if (editing?.photoUrl) URL.revokeObjectURL(editing.photoUrl);
        const { upload, thumb } = await preparePhoto(file);
        const photoUrl = URL.createObjectURL(thumb);
        const opened = Date.now();
        const base: Editing = {
            draft: { ...EMPTY_DRAFT },
            photo: thumb,
            photoUrl,
            uncertain: new Set(),
            status: undefined,
            mode: "scan",
            opened,
            verifying: scanEnabled,
        };
        setEditing(base);
        if (!scanEnabled) return;
        scanSession.current = opened;
        try {
            if (!turnstile.current && turnstileBox.current) {
                turnstile.current = new TurnstileClient(siteKey, turnstileBox.current, (needsTap) =>
                    setEditing((e) => (e?.verifying ? { ...e, needsTap } : e)),
                );
            }
            const token = await (turnstile.current as TurnstileClient).token();
            // The user may have chosen to fill it in by hand (or cancelled) while the check ran.
            if (scanSession.current !== opened) return;
            setEditing((e) =>
                e && e.photoUrl === photoUrl
                    ? {
                          ...e,
                          verifying: false,
                          needsTap: false,
                          status: { kind: "busy", text: "Reading the card…" },
                      }
                    : e,
            );
            const scan = await callScan(upload, token);
            if (scanSession.current !== opened) return;
            setEditing((e) =>
                e && e.photoUrl === photoUrl
                    ? {
                          ...e,
                          draft: draftFromScan(scan, e.draft),
                          uncertain: new Set(scan.uncertain),
                          status: {
                              kind: "info",
                              text: scan.uncertain.length
                                  ? "Read it. Check the highlighted parts."
                                  : "Read it. Check and save.",
                          },
                      }
                    : e,
            );
        } catch (err) {
            if (scanSession.current !== opened) return;
            setEditing((e) =>
                e && e.photoUrl === photoUrl
                    ? {
                          ...e,
                          verifying: false,
                          needsTap: false,
                          status: {
                              kind: "error",
                              text: `${(err as Error).message} Fill it in by hand.`,
                          },
                      }
                    : e,
            );
        }
    };

    const save = async (then: "close" | "next") => {
        if (!editing || !cards) return;
        const { draft } = editing;
        const id = draft.id ?? newId();
        let photoId = draft.photoId;
        if (editing.photo && !photoId) {
            photoId = id;
            await savePhoto(photoId, editing.photo);
        }
        const card: Card = {
            ...draft,
            id,
            name: draft.name.trim(),
            twoHanded: draft.slot === "weapon" && draft.twoHanded,
            damage: Math.min(draft.damage, draft.durability),
            createdAt: draft.createdAt ?? Date.now(),
            photoId,
        };
        const next = draft.id ? cards.map((c) => (c.id === id ? card : c)) : [...cards, card];
        await persist(next);
        await learnPreset(card);
        setPresets(await loadPresets());
        const mode = editing.mode;
        closeEditor();
        if (then === "next") {
            if (mode === "scan" && scanEnabled) startScan();
            else
                setEditing({
                    draft: { ...EMPTY_DRAFT },
                    uncertain: new Set(),
                    status: undefined,
                    mode: "manual",
                    opened: Date.now(),
                });
        }
    };

    const remove = async () => {
        if (!editing?.draft.id || !cards) return;
        const card = cards.find((c) => c.id === editing.draft.id);
        if (card?.photoId) await deletePhoto(card.photoId);
        await persist(cards.filter((c) => c.id !== editing.draft.id));
        closeEditor();
    };

    const edit = async (card: Card) => {
        const blob = card.photoId ? await loadPhoto(card.photoId) : undefined;
        setEditing({
            draft: { ...card },
            photoUrl: blob ? URL.createObjectURL(blob) : undefined,
            uncertain: new Set(),
            status: undefined,
            mode: "edit",
            opened: Date.now(),
        });
    };

    const damage = (card: Card, delta: number) => {
        if (!cards) return;
        const d = Math.max(0, Math.min(card.durability, card.damage + delta));
        persist(cards.map((c) => (c.id === card.id ? { ...c, damage: d } : c)));
    };

    const exportFile = () => {
        if (!cards) return;
        const blob = new Blob([JSON.stringify({ version: 1, cards: strip(cards) }, null, 2)], {
            type: "application/json",
        });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `exilecon-cards-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    };

    const importFile = async (file: File | undefined) => {
        if (!file) return;
        try {
            setPendingImport(hydrate(JSON.parse(await file.text())));
        } catch {
            setNotice("That file isn't a card export.");
        }
    };

    const share = async () => {
        if (!cards?.length) return;
        const url = `${location.origin}/cards/#import=${await encodeCards(cards)}`;
        if (navigator.share) {
            await navigator.share({ title: "My ExileCon cards", url }).catch(() => undefined);
        } else {
            await navigator.clipboard.writeText(url);
            setNotice("Share link copied.");
        }
    };

    const acceptImport = async (replace: boolean) => {
        if (!pendingImport || !cards) return;
        await persist(replace ? pendingImport : [...cards, ...pendingImport]);
        setNotice(`Imported ${pendingImport.length} card${pendingImport.length === 1 ? "" : "s"}.`);
        setPendingImport(null);
        history.replaceState(null, "", location.pathname);
    };

    return (
        <div className="space-y-4">
            <input
                ref={cameraInput}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                    onPhoto(e.target.files?.[0]);
                    e.target.value = "";
                }}
            />
            <input
                ref={importInput}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => {
                    importFile(e.target.files?.[0]);
                    e.target.value = "";
                }}
            />
            {notice ? (
                <button
                    type="button"
                    onClick={() => setNotice(undefined)}
                    className="w-full rounded-lg bg-panel-2 p-3 text-left text-sm"
                >
                    {notice}
                </button>
            ) : null}

            {pendingImport ? (
                <div className="space-y-2 rounded-xl border border-gold/60 bg-panel p-3 text-sm">
                    <p>
                        Import {pendingImport.length} card{pendingImport.length === 1 ? "" : "s"}?
                    </p>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            className="h-10 flex-1 rounded-lg bg-gold font-semibold text-ink"
                            onClick={() => acceptImport(false)}
                        >
                            Add to mine
                        </button>
                        <button
                            type="button"
                            className="h-10 flex-1 rounded-lg border border-edge"
                            onClick={() => acceptImport(true)}
                        >
                            Replace mine
                        </button>
                        <button
                            type="button"
                            className="h-10 rounded-lg border border-edge px-3"
                            onClick={() => setPendingImport(null)}
                        >
                            No
                        </button>
                    </div>
                </div>
            ) : null}

            {editing?.verifying ? (
                <section
                    ref={editorBox}
                    className="scroll-mt-16 space-y-3 rounded-xl border border-gold/50 bg-panel p-3"
                    aria-live="polite"
                >
                    <div className="flex items-center gap-3">
                        {editing.photoUrl ? (
                            <img
                                src={editing.photoUrl}
                                alt="Card"
                                className="h-28 w-auto shrink-0 rounded-lg border border-edge object-cover"
                            />
                        ) : null}
                        <div className="text-sm">
                            <div className="font-semibold text-gold">
                                {editing.needsTap ? "One tap first" : "Checking you're human…"}
                            </div>
                            <p className="mt-1 text-muted">
                                {editing.needsTap
                                    ? "Tick “Verify you are human” below, then the card is read for you."
                                    : "This stops bots using the card reader. It only takes a moment."}
                            </p>
                        </div>
                    </div>
                    <div className="flex gap-2 text-sm">
                        <button
                            type="button"
                            onClick={fillByHand}
                            className="h-10 flex-1 rounded-lg border border-gold px-3 text-gold"
                        >
                            Fill in by hand instead
                        </button>
                        <button
                            type="button"
                            onClick={closeEditor}
                            className="h-10 rounded-lg border border-edge px-3"
                        >
                            Cancel
                        </button>
                    </div>
                </section>
            ) : null}

            {/* Cloudflare Turnstile renders here; it's only visible when a tap is needed. */}
            <div ref={turnstileBox} className="flex justify-center empty:hidden" />

            {editing && !editing.verifying ? (
                <section
                    ref={editorBox}
                    className="scroll-mt-16 rounded-xl border border-gold/50 bg-panel p-3"
                >
                    <h2 className="mb-3 font-display text-lg font-bold text-gold">
                        {editing.mode === "edit" ? "Edit card" : "New card"}
                    </h2>
                    <CardEditor
                        draft={editing.draft}
                        onChange={(draft) => setEditing({ ...editing, draft })}
                        presets={presets}
                        photoUrl={editing.photoUrl}
                        status={editing.status}
                        uncertain={editing.uncertain}
                        onSave={() => save("close")}
                        onSaveAndNext={editing.mode === "edit" ? undefined : () => save("next")}
                        nextLabel={
                            editing.mode === "scan" && scanEnabled
                                ? "Save & scan next"
                                : "Save & next"
                        }
                        onDelete={editing.mode === "edit" ? remove : undefined}
                        onCancel={closeEditor}
                    />
                </section>
            ) : editing ? null : (
                <div className="grid grid-cols-2 gap-2">
                    <button
                        type="button"
                        onClick={startScan}
                        className="flex h-14 items-center justify-center gap-2 rounded-xl bg-gold font-semibold text-ink"
                    >
                        <Camera size={20} /> {scanEnabled ? "Scan a card" : "Photo a card"}
                    </button>
                    <button
                        type="button"
                        onClick={() =>
                            setEditing({
                                draft: { ...EMPTY_DRAFT },
                                uncertain: new Set(),
                                status: undefined,
                                mode: "manual",
                                opened: Date.now(),
                            })
                        }
                        className="flex h-14 items-center justify-center gap-2 rounded-xl border border-gold font-semibold text-gold"
                    >
                        <PenLine size={20} /> Add by hand
                    </button>
                </div>
            )}

            {cards === null ? (
                <p className="text-muted">Loading…</p>
            ) : cards.length === 0 ? (
                <p className="rounded-xl border border-edge bg-panel p-4 text-sm text-muted">
                    No cards yet. Scan each card in your starter pack, or add them by hand. They're
                    saved on this device only.
                </p>
            ) : (
                SLOTS.map((slot) => {
                    const inSlot = cards
                        .filter((c) => c.slot === slot)
                        .sort((a, b) => a.name.localeCompare(b.name));
                    if (inSlot.length === 0) return null;
                    return (
                        <section key={slot}>
                            <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted">
                                {SLOT_LABEL[slot]} ({inSlot.length})
                            </h2>
                            <ul className="divide-y divide-edge rounded-xl border border-edge bg-panel">
                                {inSlot.map((c) => (
                                    <CardRow
                                        key={c.id}
                                        card={c}
                                        onEdit={() => edit(c)}
                                        onDamage={(d) => damage(c, d)}
                                    />
                                ))}
                            </ul>
                        </section>
                    );
                })
            )}

            {cards && cards.length > 0 ? (
                <a
                    href="/fight/"
                    className="block rounded-xl border border-gold/60 p-3 text-center font-semibold text-gold"
                >
                    Check a fight with {cards.filter((c) => !isBroken(c)).length} usable card
                    {cards.filter((c) => !isBroken(c)).length === 1 ? "" : "s"} →
                </a>
            ) : null}

            <div className="flex flex-wrap gap-2 text-sm">
                <button
                    type="button"
                    onClick={share}
                    disabled={!cards?.length}
                    className="flex h-10 items-center gap-1.5 rounded-lg border border-edge px-3 disabled:opacity-40"
                >
                    <Link2 size={16} /> Share link
                </button>
                <button
                    type="button"
                    onClick={exportFile}
                    disabled={!cards?.length}
                    className="flex h-10 items-center gap-1.5 rounded-lg border border-edge px-3 disabled:opacity-40"
                >
                    <Download size={16} /> Export
                </button>
                <button
                    type="button"
                    onClick={() => importInput.current?.click()}
                    className="flex h-10 items-center gap-1.5 rounded-lg border border-edge px-3"
                >
                    <Upload size={16} /> Import
                </button>
            </div>
        </div>
    );
}
