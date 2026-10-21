"use client";

import {
  Building2,
  Droplets,
  Flag,
  Inbox,
  Leaf,
  MoreHorizontal,
  Pencil,
  Soup,
  Store,
  Trash2,
  Wrench,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import {
  IssueRow,
  LocationPath,
  StatusTimeline,
  Stepper,
  type PublicIssue,
} from "@/components/issue";
import { EmergencyNotice, NotificationItem, PublicPhotoNotice } from "@/components/notices";
import {
  EscalatedBadge,
  Highlight,
  PriorityBadge,
  Pseudonym,
  StatusBadge,
  Tag,
  TicketId,
} from "@/components/ui/badge";
import { Button, IconButton } from "@/components/ui/button";
import { Banner, EmptyState, ServiceUnavailable } from "@/components/ui/feedback";
import {
  Checkbox,
  Field,
  FormErrorSummary,
  Input,
  OptionCard,
  Radio,
  Select,
  Switch,
  Textarea,
} from "@/components/ui/field";
import { Thumbnail, UploadDropzone, type UploadItem } from "@/components/ui/media";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTrigger,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  Tabs,
  TabsContent,
  TabsList,
  Tooltip,
} from "@/components/ui/overlay";
import { Skeleton, Spinner } from "@/components/ui/spinner";
import { DataTable, LoadMore, Panel, RuledList } from "@/components/ui/surface";
import { useToast } from "@/components/ui/toast";
import { PRIORITIES, STATUSES } from "@/lib/domain/complaint";

const photo = (hue: number) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" fill="hsl(${hue} 30% 82%)"/><rect x="18" y="62" width="84" height="12" rx="6" fill="hsl(${hue} 25% 55%)"/><circle cx="84" cy="36" r="14" fill="hsl(${hue} 35% 65%)"/></svg>`,
  )}`;

const ISSUES: PublicIssue[] = [
  {
    id: "1",
    ticketId: "CR-000142",
    title: "No drinking water on the second floor since this morning",
    category: "Water & utilities",
    status: "assigned",
    priority: "critical",
    escalated: true,
    supportCount: 14,
    location: ["Block B", "Second floor", "Water cooler"],
    createdAt: "2026-10-21T03:40:00Z",
    thumbUrl: photo(200),
  },
  {
    id: "2",
    ticketId: "CR-000139",
    title: "Mess dinner served cold three days in a row",
    category: "Mess",
    status: "in_progress",
    priority: "normal",
    supportCount: 31,
    location: ["Mess", "Dining hall"],
    createdAt: "2026-10-20T15:10:00Z",
  },
  {
    id: "3",
    ticketId: "CR-000127",
    title: "Corridor tube light flickering near the stairs",
    category: "Infrastructure",
    status: "resolved",
    priority: "low",
    supportCount: 2,
    location: ["Block A", "Ground floor", "Corridor"],
    createdAt: "2026-10-18T11:25:00Z",
    thumbUrl: photo(45),
  },
];

const EMERGENCY = [
  { label: "Campus security", phone: "0512 259 0000" },
  { label: "Health centre", phone: "0512 259 0001" },
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 border-t border-rule pt-8">
      <h2 className="text-xl font-bold">{title}</h2>
      {children}
    </section>
  );
}

const SWATCHES = [
  ["paper", "Page background"],
  ["sheet", "Surfaces"],
  ["sheet-sunk", "Inset, skeleton"],
  ["rule", "Register lines"],
  ["line-strong", "Input borders"],
  ["text", "Body text"],
  ["muted", "Secondary text"],
  ["ink", "Primary, links, focus"],
  ["ink-soft", "Selected, hover"],
  ["highlight", "Needs your action"],
  ["danger", "Errors, critical"],
  ["success", "Done"],
  ["warning", "Caution"],
];

export function Gallery() {
  const toast = useToast();
  const [notify, setNotify] = useState(true);
  const [uploads, setUploads] = useState<UploadItem[]>([
    { id: "a", name: "cooler-leak.jpg", previewUrl: photo(200) },
    { id: "b", name: "corridor.png", previewUrl: photo(45), progress: 62 },
    { id: "c", name: "scan.svg", error: "SVG files aren't accepted. Use JPEG, PNG or WebP." },
  ]);

  return (
    <AppShell role="admin" unread={3}>
      <div className="mx-auto flex max-w-3xl flex-col gap-8">
        <header className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold">Design system</h1>
          <p className="max-w-prose text-muted">
            Ballpoint ink on clean register paper. One sheet per screen, lists ruled rather than
            boxed, and a highlighter kept for the single thing that needs the resident&apos;s
            action.
          </p>
        </header>

        <Section title="Colour">
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {SWATCHES.map(([token, use]) => (
              <li key={token} className="flex items-center gap-3">
                <span
                  className="size-10 shrink-0 rounded-thumb border border-rule"
                  style={{ background: `var(--${token})` }}
                />
                <span className="flex flex-col text-sm">
                  <span className="font-semibold">{token}</span>
                  <span className="text-muted">{use}</span>
                </span>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Type">
          <p className="text-sm text-muted">
            Atkinson Hyperlegible Next, built for low-vision readability, at 16px body with a
            minor-third scale.
          </p>
          <div className="flex flex-col gap-2">
            <p className="text-3xl font-bold">3xl: Your complaint is in the register</p>
            <p className="text-2xl font-bold">2xl: Water & utilities</p>
            <p className="text-xl font-bold">xl: Section heading</p>
            <p className="text-lg font-semibold">lg: Panel title</p>
            <p>
              base: Body copy reads at 16px with generous line height so long descriptions stay easy
              to follow on a phone.
            </p>
            <p className="text-sm">sm: Hints and secondary details</p>
            <p className="text-xs">xs: Meta such as ticket numbers and times</p>
          </div>
        </Section>

        <Section title="Highlighter">
          <p className="max-w-prose">
            The maintenance team marked this fixed.{" "}
            <Highlight>Confirm it&apos;s fixed by 24 Oct</Highlight>, or tell us it&apos;s still a
            problem.
          </p>
          <p className="text-sm text-muted">Use it once per screen, for a pending action only.</p>
        </Section>

        <Section title="Buttons">
          <div className="flex flex-wrap items-center gap-3">
            <Button>Submit complaint</Button>
            <Button variant="secondary">Save draft</Button>
            <Button variant="ghost">Cancel</Button>
            <Button variant="destructive" icon={<Trash2 aria-hidden className="size-5" />}>
              Hide comment
            </Button>
            <Button loading>Submitting</Button>
            <Button disabled>Disabled</Button>
            <Button size="sm" variant="secondary">
              Small
            </Button>
            <IconButton label="Edit">
              <Pencil aria-hidden className="size-5" />
            </IconButton>
          </div>
        </Section>

        <Section title="Form fields">
          <FormErrorSummary
            focusOnChange={false}
            errors={[{ fieldId: "demo-title", message: "Add a title" }]}
          />
          <Panel as="div" className="flex flex-col gap-5 p-4">
            <Field
              label="Title"
              required
              hint="Say what's wrong in a few words."
              error="Add a title"
            >
              <Input placeholder="e.g. No hot water in bathroom 3" />
            </Field>
            <Field label="What happened" required>
              <Textarea maxLength={2000} placeholder="When did it start? Who is affected?" />
            </Field>
            <Field label="Block" required>
              <Select defaultValue="">
                <option value="" disabled>
                  Choose a block
                </option>
                <option>Block A</option>
                <option>Block B</option>
              </Select>
            </Field>
            <Field label="Location details">
              <Input placeholder="e.g. near the stairs" />
            </Field>
            <fieldset className="flex flex-col">
              <legend className="mb-1 font-semibold">Who can see this?</legend>
              <Radio
                name="vis"
                defaultChecked
                label="Public"
                description="Residents see it in the feed, without your name or room."
              />
              <Radio
                name="vis"
                label="Confidential"
                description="Only admins see it. Use for personal or sensitive issues."
              />
            </fieldset>
            <Checkbox label="This is urgent" description="Admins will review the priority." />
            <Switch
              checked={notify}
              onCheckedChange={setNotify}
              label="Non-essential notifications"
              description="Comments and support on your complaints"
            />
          </Panel>
        </Section>

        <Section title="Category picker">
          <fieldset className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <legend className="sr-only">Category</legend>
            {[
              ["Mess", "Food quality, hygiene, timing", Soup],
              ["Canteen", "Food, pricing, service", Store],
              ["Infrastructure", "Repairs, electricity, Wi-Fi", Wrench],
              ["Garden & cleanliness", "Waste, pests, common areas", Leaf],
              ["Water & utilities", "Drinking water, hot water, power", Droplets],
              ["Other", "Anything else", Building2],
            ].map(([label, desc, Icon]) => {
              const I = Icon as typeof Soup;
              return (
                <OptionCard
                  key={label as string}
                  name="cat"
                  value={label as string}
                  label={label as string}
                  description={desc as string}
                  icon={<I aria-hidden className="size-5" />}
                  defaultChecked={label === "Water & utilities"}
                />
              );
            })}
          </fieldset>
        </Section>

        <Section title="Status, priority and identity">
          <div className="flex flex-wrap gap-2">
            {STATUSES.map((s) => (
              <StatusBadge key={s} status={s} />
            ))}
            <EscalatedBadge />
          </div>
          <div className="flex flex-wrap gap-4">
            {PRIORITIES.map((p) => (
              <PriorityBadge key={p} priority={p} />
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <TicketId id="CR-000142" />
            <Tag>Water & utilities</Tag>
            <Pseudonym alias="Quiet Heron" />
            <Pseudonym alias="A resident" />
            <LocationPath parts={["Block B", "Second floor", "Common bathroom"]} />
          </div>
        </Section>

        <Section title="Feed">
          <Tabs defaultValue="trending">
            <TabsList
              label="Feed views"
              tabs={[
                { value: "trending", label: "Trending" },
                { value: "open", label: "Unresolved", count: 23 },
                { value: "resolved", label: "Recently resolved" },
                { value: "supported", label: "Most supported" },
              ]}
            />
            <TabsContent value="trending" className="pt-4">
              <Panel>
                <RuledList label="Trending complaints">
                  {ISSUES.map((i) => (
                    <IssueRow key={i.id} issue={i} href="#" />
                  ))}
                </RuledList>
                <LoadMore shown={3} total={23} onLoadMore={() => {}} />
              </Panel>
            </TabsContent>
            {["open", "resolved", "supported"].map((v) => (
              <TabsContent key={v} value={v} className="pt-4">
                <Panel>
                  <EmptyState
                    icon={Inbox}
                    title="Nothing here yet"
                    action={<Button size="sm">Report a problem</Button>}
                  >
                    When residents report problems, they show up here. Report one if you&apos;ve
                    spotted something.
                  </EmptyState>
                </Panel>
              </TabsContent>
            ))}
          </Tabs>
        </Section>

        <Section title="Complaint history">
          <Panel as="div" className="p-4">
            <StatusTimeline
              events={[
                { id: "1", status: "submitted", at: "2026-10-21T03:40:00Z", byline: "Quiet Heron" },
                {
                  id: "2",
                  status: "assigned",
                  at: "2026-10-21T04:05:00Z",
                  note: "Sent to the hostel plumber.",
                  byline: "Recorded by admin",
                },
                {
                  id: "3",
                  status: "in_progress",
                  at: "2026-10-21T06:30:00Z",
                  note: "Plumber says the pump is being replaced today.",
                  byline: "Recorded by admin from the plumber's update",
                },
              ]}
            />
          </Panel>
        </Section>

        <Section title="Guided form progress">
          <Stepper steps={["Category", "Location", "Details", "Photos", "Review"]} current={1} />
        </Section>

        <Section title="Notices">
          <EmergencyNotice contacts={EMERGENCY} />
          <PublicPhotoNotice />
          <Banner tone="success" title="Complaint submitted">
            Ticket CR-000143 is in the register. You&apos;ll get a notification when it&apos;s
            assigned.
          </Banner>
          <Banner tone="warning" title="This complaint is overdue">
            It passed its 8-hour handling target. A committee lead has been notified.
          </Banner>
          <ServiceUnavailable
            draftSaved
            action={
              <Button size="sm" variant="secondary">
                Try again
              </Button>
            }
          />
        </Section>

        <Section title="Notifications">
          <Panel>
            <RuledList label="Notifications">
              <NotificationItem
                n={{
                  id: "1",
                  title: "CR-000142 was assigned",
                  body: "Sent to the hostel plumber.",
                  at: "2026-10-21T04:05:00Z",
                  href: "#",
                  read: false,
                }}
              />
              <NotificationItem
                n={{
                  id: "2",
                  title: "Is CR-000127 fixed?",
                  body: "Confirm by 24 Oct or it closes automatically.",
                  at: "2026-10-20T09:00:00Z",
                  href: "#",
                  read: true,
                }}
              />
            </RuledList>
          </Panel>
        </Section>

        <Section title="Overlays">
          <div className="flex flex-wrap gap-3">
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="secondary">Open bottom sheet</Button>
              </DialogTrigger>
              <DialogContent
                title="Still a problem?"
                description="CR-000127 will reopen and go back to the admin queue."
              >
                <Field label="What's still wrong">
                  <Textarea maxLength={500} />
                </Field>
                <div className="mt-5 flex justify-end gap-2">
                  <DialogClose asChild>
                    <Button variant="ghost">Cancel</Button>
                  </DialogClose>
                  <Button>Reopen complaint</Button>
                </div>
              </DialogContent>
            </Dialog>
            <Menu>
              <MenuTrigger asChild>
                <IconButton label="More actions" variant="secondary">
                  <MoreHorizontal aria-hidden className="size-5" />
                </IconButton>
              </MenuTrigger>
              <MenuContent>
                <MenuItem icon={<Pencil aria-hidden className="size-4" />}>Edit</MenuItem>
                <MenuItem icon={<Flag aria-hidden className="size-4" />}>Report content</MenuItem>
                <MenuItem destructive icon={<Trash2 aria-hidden className="size-4" />}>
                  Hide
                </MenuItem>
              </MenuContent>
            </Menu>
            <Tooltip content="Residents who said this affects them too">
              <Button variant="ghost">Hover for tooltip</Button>
            </Tooltip>
            <Button
              variant="secondary"
              onClick={() =>
                toast({
                  title: "Complaint submitted",
                  body: "Ticket CR-000143 is in the register.",
                })
              }
            >
              Show toast
            </Button>
          </div>
        </Section>

        <Section title="Photos">
          <PublicPhotoNotice />
          <UploadDropzone
            items={uploads}
            maxFiles={3}
            maxMb={5}
            onAdd={() => {}}
            onRemove={(id) => setUploads((u) => u.filter((x) => x.id !== id))}
          />
          <div className="flex gap-2">
            <Thumbnail src={photo(200)} alt="Water cooler with an empty tank" />
            <Thumbnail src={photo(45)} alt="Flickering corridor light" size="sm" />
          </div>
        </Section>

        <Section title="Admin table">
          <Panel>
            <DataTable
              caption="Assignment queue"
              rowKey={(r) => r.ticketId}
              rows={ISSUES}
              columns={[
                { key: "id", header: "Ticket", cell: (r) => <TicketId id={r.ticketId} /> },
                { key: "title", header: "Title", cell: (r) => r.title },
                { key: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
                {
                  key: "pri",
                  header: "Priority",
                  cell: (r) => <PriorityBadge priority={r.priority} />,
                },
                { key: "sup", header: "Support", cell: (r) => r.supportCount, numeric: true },
              ]}
            />
          </Panel>
        </Section>

        <Section title="Loading">
          <Panel as="div" className="flex flex-col gap-3 p-4">
            <Skeleton className="h-5 w-24 rounded-full" />
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </Panel>
          <Spinner label="Loading complaints" className="text-ink" />
        </Section>
      </div>
    </AppShell>
  );
}
