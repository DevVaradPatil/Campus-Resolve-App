"use client";

import {
  ArrowLeft,
  ArrowRight,
  Coffee,
  Droplets,
  HelpCircle,
  Leaf,
  Lock,
  Megaphone,
  Send,
  Tag,
  TriangleAlert,
  UtensilsCrossed,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { LocationPath, Stepper } from "@/components/issue";
import { EmergencyNotice, PublicPhotoNotice } from "@/components/notices";
import { PriorityBadge, Pseudonym } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Banner, ServiceUnavailable } from "@/components/ui/feedback";
import { Checkbox, Field, Input, OptionCard, Select, Textarea } from "@/components/ui/field";
import type { UploadItem } from "@/components/ui/media";
import { UploadDropzone } from "@/components/ui/media";
import { Skeleton } from "@/components/ui/spinner";
import { Panel } from "@/components/ui/surface";
import { useToast } from "@/components/ui/toast";
import { api, ApiError, downscalePhoto, uploadPhoto } from "@/lib/client/api";
import { useAuth } from "@/lib/client/auth";
import { useHostelConfig } from "@/lib/client/config";
import {
  LIMITS,
  LOCATION_TYPES,
  priorityFor,
  safeLocationLabel,
  type LocationType,
  type Visibility,
} from "@/lib/domain/complaint";

// Icons for the default categories; admin-added ones fall back to a tag.
const CATEGORY_ICON: Record<string, LucideIcon> = {
  mess: UtensilsCrossed,
  canteen: Coffee,
  infrastructure: Wrench,
  "garden-cleanliness": Leaf,
  "water-utilities": Droplets,
  other: HelpCircle,
};

const STEPS = ["Category", "Location", "Details", "Visibility and photos", "Review"];
const DRAFT_KEY = "cr:new-complaint-draft";
const TYPES_ALLOWED = ["image/jpeg", "image/png", "image/webp"];

type Draft = {
  idempotencyKey: string;
  categoryId: string;
  subcategoryId: string;
  urgent: boolean;
  blockId: string;
  floorId: string;
  type: LocationType | "";
  roomReference: string;
  locationDescription: string;
  title: string;
  description: string;
  visibility: Visibility | "";
};

const blank = (): Draft => ({
  idempotencyKey: crypto.randomUUID(),
  categoryId: "",
  subcategoryId: "",
  urgent: false,
  blockId: "",
  floorId: "",
  type: "",
  roomReference: "",
  locationDescription: "",
  title: "",
  description: "",
  visibility: "",
});

// Drafts survive reloads and failed submits (PRD §8.3). Storage can be unavailable: then we just don't persist.
function loadDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? { ...blank(), ...JSON.parse(raw) } : null;
  } catch {
    return null;
  }
}
function saveDraft(d: Draft | null) {
  try {
    if (d) localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
    else localStorage.removeItem(DRAFT_KEY);
  } catch {}
}

type Photo = UploadItem & { file: File };

export default function NewComplaintPage() {
  const { state } = useAuth();
  const { config, error: configError } = useHostelConfig();
  const router = useRouter();
  const toast = useToast();
  // RequireAuth renders this only in the browser, so reading localStorage here is safe.
  const [draft, setDraft] = useState<Draft>(() => loadDraft() ?? blank());
  const [restored, setRestored] = useState(
    () => !!(draft.categoryId || draft.title || draft.description),
  );
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<ApiError>();
  const heading = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    heading.current?.focus();
  }, [step]);

  const set = (patch: Partial<Draft>) => {
    setDraft((d) => {
      const next = { ...d, ...patch };
      saveDraft(next);
      return next;
    });
    setErrors({});
  };

  if (configError)
    return (
      <Shell>
        <ServiceUnavailable />
      </Shell>
    );
  if (!config || state.status !== "signedIn")
    return (
      <Shell>
        <Skeleton className="h-96" />
      </Shell>
    );

  const category = config.categories.find((c) => c.id === draft.categoryId);
  const block = config.blocks.find((b) => b.id === draft.blockId);
  const priority = category && priorityFor(category, draft.subcategoryId || null).priority;
  const locationLabel = draft.type
    ? safeLocationLabel(
        {
          blockId: draft.blockId || null,
          floorId: draft.floorId || null,
          type: draft.type,
          roomReference: null,
          description: null,
        },
        config.blocks,
      )
    : [];

  function validate(s: number) {
    const e: Record<string, string> = {};
    if (s === 0 && !category) e.category = "Choose a category.";
    if (s === 1 && !draft.type) e.type = "Choose what kind of place it is.";
    if (s === 2) {
      if (draft.title.trim().length < 5) e.title = "Write a short title of at least 5 characters.";
      if (draft.description.trim().length < 10)
        e.description = "Describe the problem in at least 10 characters.";
    }
    if (s === 3 && !draft.visibility) e.visibility = "Choose who can see this complaint.";
    setErrors(e);
    return !Object.keys(e).length;
  }

  function addPhotos(files: File[]) {
    const room = LIMITS.photos - photos.length;
    const next = files.slice(0, room).map((file) => ({
      id: crypto.randomUUID(),
      name: file.name,
      file,
      previewUrl: URL.createObjectURL(file),
      error: !TYPES_ALLOWED.includes(file.type)
        ? "Only JPEG, PNG or WebP photos."
        : file.size > 15 * 1024 * 1024
          ? "This photo is too large."
          : undefined,
    }));
    setPhotos((p) => [...p, ...next]);
    if (files.length > room)
      toast({ title: `Only ${LIMITS.photos} photos per complaint.`, tone: "info" });
  }

  async function submit() {
    setSubmitting(true);
    setSubmitError(undefined);
    let created: { id: string; ticketId: string };
    try {
      created = await api("/api/complaints", {
        method: "POST",
        body: {
          idempotencyKey: draft.idempotencyKey,
          categoryId: draft.categoryId,
          subcategoryId: draft.subcategoryId || null,
          title: draft.title,
          description: draft.description,
          location: {
            blockId: draft.blockId || null,
            floorId: draft.floorId || null,
            type: draft.type,
            roomReference: draft.roomReference,
            description: draft.locationDescription,
          },
          urgent: draft.urgent,
          visibility: draft.visibility,
        },
      });
    } catch (e) {
      setSubmitError(e as ApiError);
      setSubmitting(false);
      return;
    }
    // The complaint is saved; photos are best-effort and can be re-added from the complaint page.
    saveDraft(null);
    let failed = 0;
    for (const p of photos.filter((p) => !p.error)) {
      const update = (patch: Partial<Photo>) =>
        setPhotos((ps) => ps.map((x) => (x.id === p.id ? { ...x, ...patch } : x)));
      try {
        update({ progress: 0 });
        await uploadPhoto(created.id, await downscalePhoto(p.file), (progress) =>
          update({ progress }),
        );
        update({ progress: undefined });
      } catch (e) {
        failed++;
        update({ progress: undefined, error: (e as Error).message });
      }
    }
    toast({
      title: `Submitted as ${created.ticketId}`,
      tone: failed ? "info" : "success",
      body: failed
        ? `${failed} photo${failed > 1 ? "s" : ""} didn't upload. You can add ${failed > 1 ? "them" : "it"} from the complaint page.`
        : undefined,
    });
    router.push(`/complaints/${created.id}`);
  }

  const next = () => validate(step) && setStep(step + 1);

  return (
    <Shell>
      {restored && (
        <Banner
          tone="info"
          title="We restored your unsent draft"
          action={
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                saveDraft(null);
                setDraft(blank());
                setPhotos([]);
                setStep(0);
                setRestored(false);
              }}
            >
              Start over
            </Button>
          }
        />
      )}
      <Stepper steps={STEPS} current={step} />
      <Panel>
        <form
          className="flex flex-col gap-5 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (step < STEPS.length - 1) next();
            else submit();
          }}
          noValidate
        >
          <h2 ref={heading} tabIndex={-1} className="text-lg font-bold outline-none">
            {
              [
                "What's the problem about?",
                "Where is it?",
                "Describe it",
                "Who can see it?",
                "Check and submit",
              ][step]
            }
          </h2>

          {step === 0 && (
            <>
              <EmergencyNotice compact contacts={config.emergencyContacts} />
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-2 font-semibold">Category</legend>
                {errors.category && (
                  <p className="text-sm font-semibold text-danger">{errors.category}</p>
                )}
                <div className="grid gap-2 sm:grid-cols-2">
                  {config.categories.map((c) => (
                    <OptionCard
                      key={c.id}
                      name="category"
                      value={c.id}
                      label={c.label}
                      description={c.description}
                      icon={(() => {
                        const Icon = CATEGORY_ICON[c.id] ?? Tag;
                        return <Icon aria-hidden className="size-5" />;
                      })()}
                      checked={draft.categoryId === c.id}
                      onChange={() => set({ categoryId: c.id, subcategoryId: "" })}
                    />
                  ))}
                </div>
              </fieldset>
              {category && category.subcategories.length > 0 && (
                <Field label="More specifically">
                  <Select
                    value={draft.subcategoryId}
                    onChange={(e) => set({ subcategoryId: e.target.value })}
                  >
                    <option value="">Not sure / something else</option>
                    {category.subcategories.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
              {priority === "critical" && (
                <Banner tone="warning" title="This will be treated as critical">
                  The hostel lead is alerted as soon as you submit. If anyone is in danger, call the
                  emergency numbers above first.
                </Banner>
              )}
              <Checkbox
                label="This is urgent for me"
                description="Tells the admin it's pressing for you. Priority itself comes from the category."
                checked={draft.urgent}
                onChange={(e) => set({ urgent: e.target.checked })}
              />
            </>
          )}

          {step === 1 && (
            <>
              <Field label="Block" hint="Leave as hostel-wide for the mess, canteen or grounds.">
                <Select
                  value={draft.blockId}
                  onChange={(e) => set({ blockId: e.target.value, floorId: "" })}
                >
                  <option value="">Hostel-wide / not in a block</option>
                  {config.blocks.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.label}
                    </option>
                  ))}
                </Select>
              </Field>
              {block && block.floors.length > 0 && (
                <Field label="Floor">
                  <Select value={draft.floorId} onChange={(e) => set({ floorId: e.target.value })}>
                    <option value="">Whole block / outside</option>
                    {block.floors.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
              <Field label="Kind of place" required error={errors.type}>
                <Select
                  value={draft.type}
                  onChange={(e) => set({ type: e.target.value as LocationType })}
                >
                  <option value="" disabled>
                    Choose one
                  </option>
                  {Object.entries(LOCATION_TYPES).map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                label="Room number or exact spot"
                hint={
                  <>
                    <Lock aria-hidden className="mr-1 inline size-3.5" />
                    Private: only you and hostel admins see this.
                  </>
                }
              >
                <Input
                  value={draft.roomReference}
                  maxLength={LIMITS.roomReference}
                  onChange={(e) => set({ roomReference: e.target.value })}
                />
              </Field>
              <Field
                label="Anything else about where it is"
                hint="Private, like the room number. For example: next to the water cooler."
              >
                <Input
                  value={draft.locationDescription}
                  maxLength={LIMITS.locationDescription}
                  onChange={(e) => set({ locationDescription: e.target.value })}
                />
              </Field>
            </>
          )}

          {step === 2 && (
            <>
              <Field label="Title" required error={errors.title} hint="One line, like a headline.">
                <Input
                  value={draft.title}
                  maxLength={LIMITS.title}
                  onChange={(e) => set({ title: e.target.value })}
                />
              </Field>
              <Field
                label="What's happening?"
                required
                error={errors.description}
                hint="Since when, how often, and what you've already tried. If you make it public, every resident can read this, so leave out names and room numbers."
              >
                <Textarea
                  value={draft.description}
                  maxLength={LIMITS.description}
                  rows={6}
                  onChange={(e) => set({ description: e.target.value })}
                />
              </Field>
            </>
          )}

          {step === 3 && (
            <>
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-2 font-semibold">Visibility</legend>
                {errors.visibility && (
                  <p className="text-sm font-semibold text-danger">{errors.visibility}</p>
                )}
                <OptionCard
                  name="visibility"
                  value="public"
                  icon={<Megaphone aria-hidden className="size-5" />}
                  label="Public"
                  description={`Every resident can see it and add support. It's shown under your public name, ${state.me.pseudonym}, never your real name or room.`}
                  checked={draft.visibility === "public"}
                  onChange={() => set({ visibility: "public" })}
                />
                <OptionCard
                  name="visibility"
                  value="confidential"
                  icon={<Lock aria-hidden className="size-5" />}
                  label="Confidential"
                  description="Only you and hostel admins can see it. Use this for anything personal or sensitive."
                  checked={draft.visibility === "confidential"}
                  onChange={() => set({ visibility: "confidential" })}
                />
              </fieldset>
              <div className="flex flex-col gap-3">
                <p className="font-semibold">
                  Photos <span className="font-normal text-muted">(optional)</span>
                </p>
                {draft.visibility === "public" && <PublicPhotoNotice />}
                <UploadDropzone
                  items={photos}
                  maxFiles={LIMITS.photos}
                  maxMb={LIMITS.photoMb}
                  onAdd={addPhotos}
                  onRemove={(id) => setPhotos((p) => p.filter((x) => x.id !== id))}
                />
              </div>
            </>
          )}

          {step === 4 && category && (
            <>
              <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-[auto_1fr]">
                <dt className="text-muted">Category</dt>
                <dd>
                  {category.label}
                  {draft.subcategoryId &&
                    ` · ${category.subcategories.find((s) => s.id === draft.subcategoryId)?.label}`}
                  <span className="ml-2">{priority && <PriorityBadge priority={priority} />}</span>
                </dd>
                <dt className="text-muted">Where</dt>
                <dd className="flex flex-col gap-1">
                  <LocationPath parts={locationLabel} />
                  {(draft.roomReference || draft.locationDescription) && (
                    <span className="text-sm">
                      <Lock aria-hidden className="mr-1 inline size-3.5 text-muted" />
                      {[draft.roomReference, draft.locationDescription].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </dd>
                <dt className="text-muted">Title</dt>
                <dd className="font-semibold">{draft.title}</dd>
                <dt className="text-muted">Description</dt>
                <dd className="whitespace-pre-wrap">{draft.description}</dd>
                <dt className="text-muted">Visibility</dt>
                <dd>
                  {draft.visibility === "public" ? (
                    <span className="flex flex-wrap items-center gap-2">
                      Public, shown as <Pseudonym alias={state.me.pseudonym} />
                    </span>
                  ) : (
                    "Confidential: only you and hostel admins"
                  )}
                </dd>
                <dt className="text-muted">Photos</dt>
                <dd>{photos.filter((p) => !p.error).length || "None"}</dd>
              </dl>
              {submitError &&
                (submitError.status === 0 ? (
                  <ServiceUnavailable draftSaved />
                ) : (
                  <Banner tone="danger" icon={TriangleAlert} title={submitError.message}>
                    {submitError.fields.length > 0 && (
                      <ul className="list-disc pl-5">
                        {submitError.fields.map((f) => (
                          <li key={f.path}>{f.message}</li>
                        ))}
                      </ul>
                    )}
                    Your draft is still saved on this device.
                  </Banner>
                ))}
            </>
          )}

          <div className="flex flex-wrap justify-between gap-3 border-t border-rule pt-4">
            <Button
              variant="ghost"
              icon={<ArrowLeft aria-hidden className="size-5" />}
              onClick={() => setStep(step - 1)}
              className={step === 0 ? "invisible" : undefined}
              disabled={submitting}
            >
              Back
            </Button>
            {step < STEPS.length - 1 ? (
              <Button type="submit" icon={<ArrowRight aria-hidden className="size-5" />}>
                Next
              </Button>
            ) : (
              <Button
                type="submit"
                loading={submitting}
                icon={<Send aria-hidden className="size-5" />}
              >
                Submit complaint
              </Button>
            )}
          </div>
        </form>
      </Panel>
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <h1 className="text-2xl font-bold">New complaint</h1>
      {children}
    </div>
  );
}
