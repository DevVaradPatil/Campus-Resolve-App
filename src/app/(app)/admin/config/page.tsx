"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { PriorityBadge, Tag } from "@/components/ui/badge";
import { Button, IconButton } from "@/components/ui/button";
import { Banner, ServiceUnavailable } from "@/components/ui/feedback";
import { Checkbox, Field, Input, Select, Switch } from "@/components/ui/field";
import { Dialog, DialogContent, Tabs, TabsContent, TabsList } from "@/components/ui/overlay";
import { Skeleton } from "@/components/ui/spinner";
import { Panel, RuledList } from "@/components/ui/surface";
import { useToast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/client/api";
import { PRIORITIES, type Priority } from "@/lib/domain/complaint";
import type { Block, Category, ConfigKind } from "@/lib/domain/schemas";
import type { HostelConfig } from "@/lib/server/config";

const PRIORITY_LABEL: Record<Priority, string> = {
  critical: "Critical",
  high: "High",
  normal: "Normal",
  low: "Low",
};

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "item";

const BLANK: { [K in ConfigKind]: HostelConfig[K][number] } = {
  categories: {
    id: "",
    label: "",
    description: "",
    defaultPriority: "normal",
    closureWindowHours: 48,
    subcategories: [],
    active: true,
    order: 99,
  },
  locations: { id: "", label: "", floors: [], active: true, order: 99 },
  contacts: {
    id: "",
    name: "",
    role: "",
    phone: "",
    email: "",
    emergency: false,
    active: true,
  },
  routingRules: { id: "", categoryId: null, blockId: null, contactId: "", enabled: true },
};

const TABS: { kind: ConfigKind; label: string; noun: string }[] = [
  { kind: "categories", label: "Categories", noun: "category" },
  { kind: "locations", label: "Blocks", noun: "block" },
  { kind: "contacts", label: "Contacts", noun: "contact" },
  { kind: "routingRules", label: "Routing", noun: "routing rule" },
];

type Editing = { kind: ConfigKind; item: Record<string, unknown>; isNew: boolean };

export default function ConfigPage() {
  const toast = useToast();
  const [cfg, setCfg] = useState<HostelConfig>();
  const [loadError, setLoadError] = useState(false);
  const [editing, setEditing] = useState<Editing>();

  useEffect(() => {
    let live = true;
    api<HostelConfig>("/api/admin/config").then(
      (c) => live && setCfg(c),
      () => live && setLoadError(true),
    );
    return () => {
      live = false;
    };
  }, []);

  if (loadError) return <ServiceUnavailable />;
  if (!cfg) return <Skeleton className="mx-auto h-96 max-w-3xl" />;

  const label = (kind: ConfigKind, id: string | null, any: string) =>
    id
      ? ((cfg[kind] as { id: string; label?: string; name?: string }[]).find((x) => x.id === id)
          ?.label ??
        (cfg[kind] as { id: string; name?: string }[]).find((x) => x.id === id)?.name ??
        id)
      : any;

  const rows: { [K in ConfigKind]: (item: HostelConfig[K][number]) => ReactNode } = {
    categories: (c) => (
      <>
        <span className="font-semibold">{c.label}</span>
        <span className="flex flex-wrap items-center gap-x-3 text-sm text-muted">
          <PriorityBadge priority={c.defaultPriority} />
          {c.subcategories.length} subcategories · closes {c.closureWindowHours}h after resolution
        </span>
      </>
    ),
    locations: (b) => (
      <>
        <span className="font-semibold">{b.label}</span>
        <span className="text-sm text-muted">
          {b.floors.map((f) => f.label).join(", ") || "No floors"}
        </span>
      </>
    ),
    contacts: (c) => (
      <>
        <span className="font-semibold">{c.name}</span>
        <span className="text-sm text-muted">
          {[c.role, c.phone, c.email].filter(Boolean).join(" · ") || "No details"}
          {c.emergency && " · shown in the emergency notice"}
        </span>
      </>
    ),
    routingRules: (r) => (
      <>
        <span className="font-semibold">
          {label("categories", r.categoryId, "Any category")} ·{" "}
          {label("locations", r.blockId, "Any block")}
        </span>
        <span className="text-sm text-muted">Goes to {label("contacts", r.contactId, "")}</span>
      </>
    ),
  };

  const inactive = (item: object) =>
    ("active" in item && !item.active) || ("enabled" in item && !item.enabled);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Hostel setup</h1>
        <p className="text-muted">
          Categories, blocks, contacts and who complaints go to. Turn items off instead of deleting
          them, so older complaints keep their labels. Anything with no routing rule lands in the
          admin queue.
        </p>
      </header>
      <Panel>
        <Tabs defaultValue="categories">
          <div className="px-2 pt-2">
            <TabsList
              label="Setup sections"
              tabs={TABS.map((t) => ({ value: t.kind, label: t.label }))}
            />
          </div>
          {TABS.map(({ kind, noun }) => (
            <TabsContent key={kind} value={kind}>
              <div className="flex justify-end px-4 pt-3">
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<Plus aria-hidden className="size-4" />}
                  onClick={() => setEditing({ kind, item: { ...BLANK[kind] }, isNew: true })}
                >
                  Add {noun}
                </Button>
              </div>
              <RuledList label={TABS.find((t) => t.kind === kind)!.label}>
                {(cfg[kind] as { id: string }[]).map((item) => (
                  <li key={item.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      {(rows[kind] as (i: unknown) => ReactNode)(item)}
                    </div>
                    {inactive(item) && <Tag>Off</Tag>}
                    <IconButton
                      label={`Edit ${noun} ${item.id}`}
                      onClick={() =>
                        setEditing({ kind, item: structuredClone(item), isNew: false })
                      }
                    >
                      <Pencil aria-hidden className="size-5" />
                    </IconButton>
                  </li>
                ))}
              </RuledList>
            </TabsContent>
          ))}
        </Tabs>
      </Panel>

      {editing && (
        <EditDialog
          editing={editing}
          cfg={cfg}
          noun={TABS.find((t) => t.kind === editing.kind)!.noun}
          onClose={() => setEditing(undefined)}
          onSaved={(saved) => {
            const list = cfg[editing.kind] as { id: string }[];
            const next = list.some((x) => x.id === saved.id)
              ? list.map((x) => (x.id === saved.id ? saved : x))
              : [...list, saved];
            setCfg({ ...cfg, [editing.kind]: next });
            setEditing(undefined);
            toast({ title: "Saved" });
          }}
        />
      )}
    </div>
  );
}

function EditDialog({
  editing,
  cfg,
  noun,
  onClose,
  onSaved,
}: {
  editing: Editing;
  cfg: HostelConfig;
  noun: string;
  onClose: () => void;
  onSaved: (item: { id: string }) => void;
}) {
  const [item, setItem] = useState(editing.item);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<ApiError>();
  const set = (patch: Record<string, unknown>) => setItem((i) => ({ ...i, ...patch }));
  // New items get an id from their name until the admin edits it; saved ids never change.
  const nameKey = editing.kind === "contacts" ? "name" : "label";
  const setName = (v: string) =>
    set({ [nameKey]: v, ...(editing.isNew && !idTouched && { id: slugify(v) }) });
  const [idTouched, setIdTouched] = useState(false);

  async function save() {
    setSaving(true);
    setError(undefined);
    try {
      onSaved(await api(`/api/admin/config/${editing.kind}`, { method: "PUT", body: item }));
    } catch (e) {
      setError(e as ApiError);
    }
    setSaving(false);
  }

  const text = (key: string, label: string, max: number, required = false) => (
    <Field label={label} required={required}>
      <Input
        value={(item[key] as string) ?? ""}
        maxLength={max}
        onChange={(e) =>
          key === nameKey ? setName(e.target.value) : set({ [key]: e.target.value })
        }
      />
    </Field>
  );
  const num = (key: string, label: string, hint?: string) => (
    <Field label={label} hint={hint} required>
      <Input
        type="number"
        inputMode="numeric"
        value={String(item[key])}
        onChange={(e) => set({ [key]: Number(e.target.value) })}
      />
    </Field>
  );
  const onOff = (key: string, label: string, description?: string) => (
    <Switch
      label={label}
      description={description}
      checked={!!item[key]}
      onCheckedChange={(v) => set({ [key]: v })}
    />
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={`${editing.isNew ? "Add" : "Edit"} ${noun}`}>
        <form
          className="flex flex-col gap-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          {editing.kind === "contacts"
            ? text("name", "Name", 80, true)
            : text("label", "Name", 80, true)}
          <Field
            label="ID"
            required
            hint={
              editing.isNew
                ? "Lowercase letters, numbers and dashes. Can't change later."
                : "Fixed once saved."
            }
          >
            <Input
              value={item.id as string}
              maxLength={40}
              disabled={!editing.isNew}
              onChange={(e) => {
                setIdTouched(true);
                set({ id: e.target.value });
              }}
            />
          </Field>

          {editing.kind === "categories" && (
            <>
              {text("description", "Short description", 160)}
              <Field label="Default priority" required>
                <Select
                  value={item.defaultPriority as string}
                  onChange={(e) => set({ defaultPriority: e.target.value })}
                >
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {PRIORITY_LABEL[p]}
                    </option>
                  ))}
                </Select>
              </Field>
              {num(
                "closureWindowHours",
                "Closes automatically after (hours)",
                "Time the student has to say it isn't fixed.",
              )}
              <RowsEditor
                legend="Subcategories"
                addLabel="Add subcategory"
                rows={item.subcategories as Category["subcategories"]}
                onChange={(subcategories) => set({ subcategories })}
                blank={{ id: "", label: "" }}
                render={(row, update) => (
                  <>
                    <Input
                      aria-label="Subcategory name"
                      value={row.label}
                      maxLength={80}
                      onChange={(e) =>
                        update({
                          label: e.target.value,
                          ...(!row.saved && { id: slugify(e.target.value) }),
                        })
                      }
                    />
                    <Select
                      aria-label="Subcategory priority"
                      value={row.priority ?? ""}
                      onChange={(e) =>
                        update({ priority: (e.target.value || undefined) as Priority | undefined })
                      }
                    >
                      <option value="">Category default</option>
                      {PRIORITIES.map((p) => (
                        <option key={p} value={p}>
                          {PRIORITY_LABEL[p]}
                        </option>
                      ))}
                    </Select>
                  </>
                )}
              />
              {num("order", "Position in lists")}
              {onOff("active", "Offered on the complaint form")}
            </>
          )}

          {editing.kind === "locations" && (
            <>
              <RowsEditor
                legend="Floors"
                addLabel="Add floor"
                rows={item.floors as Block["floors"]}
                onChange={(floors) => set({ floors })}
                blank={{ id: "", label: "" }}
                render={(row, update) => (
                  <Input
                    aria-label="Floor name"
                    value={row.label}
                    maxLength={80}
                    onChange={(e) =>
                      update({
                        label: e.target.value,
                        ...(!row.saved && { id: slugify(e.target.value) }),
                      })
                    }
                  />
                )}
              />
              {num("order", "Position in lists")}
              {onOff("active", "Offered on the complaint form")}
            </>
          )}

          {editing.kind === "contacts" && (
            <>
              {text("role", "Handles", 80)}
              {text("phone", "Phone", 20)}
              {text("email", "Email", 120)}
              <Checkbox
                label="Show in the emergency notice"
                description="Only for verified emergency numbers, with consent to publish."
                checked={!!item.emergency}
                onChange={(e) => set({ emergency: e.target.checked })}
              />
              {onOff("active", "Active")}
            </>
          )}

          {editing.kind === "routingRules" && (
            <>
              <Field label="Category">
                <Select
                  value={(item.categoryId as string) ?? ""}
                  onChange={(e) => set({ categoryId: e.target.value || null })}
                >
                  <option value="">Any category</option>
                  {cfg.categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Block" hint="A rule for one block beats a rule for any block.">
                <Select
                  value={(item.blockId as string) ?? ""}
                  onChange={(e) => set({ blockId: e.target.value || null })}
                >
                  <option value="">Any block</option>
                  {cfg.locations.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Send to" required>
                <Select
                  value={item.contactId as string}
                  onChange={(e) => set({ contactId: e.target.value })}
                >
                  <option value="" disabled>
                    Choose a contact
                  </option>
                  {cfg.contacts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
              {onOff("enabled", "Rule is on")}
            </>
          )}

          {error && (
            <Banner tone="danger" title={error.message}>
              {error.fields.length > 0 && (
                <ul className="list-disc pl-5">
                  {error.fields.map((f) => (
                    <li key={f.path}>{f.message}</li>
                  ))}
                </ul>
              )}
            </Banner>
          )}
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              Save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Editable list of {id, label} rows. Rows that existed when the dialog opened keep their id. */
function RowsEditor<R extends { id: string; label: string }>({
  legend,
  addLabel,
  rows,
  blank,
  onChange,
  render,
}: {
  legend: string;
  addLabel: string;
  rows: R[];
  blank: R;
  onChange: (rows: R[]) => void;
  render: (row: R & { saved?: boolean }, update: (patch: Partial<R>) => void) => ReactNode;
}) {
  const [saved] = useState(() => new Set(rows.map((r) => r.id)));
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 font-semibold">{legend}</legend>
      {rows.map((row, i) => (
        <div key={i} className="flex items-center gap-2 [&>*]:flex-1">
          {render({ ...row, saved: saved.has(row.id) }, (patch) =>
            onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r))),
          )}
          <IconButton
            label={`Remove ${row.label || "row"}`}
            className="flex-none"
            onClick={() => onChange(rows.filter((_, j) => j !== i))}
          >
            <Trash2 aria-hidden className="size-5" />
          </IconButton>
        </div>
      ))}
      <Button
        size="sm"
        variant="ghost"
        className="self-start"
        icon={<Plus aria-hidden className="size-4" />}
        onClick={() => onChange([...rows, { ...blank }])}
      >
        {addLabel}
      </Button>
    </fieldset>
  );
}
