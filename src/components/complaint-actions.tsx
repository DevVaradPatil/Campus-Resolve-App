"use client";

import { ArrowUpCircle, CheckCircle2, EyeOff, RotateCcw, UserSearch } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Highlight } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Banner } from "@/components/ui/feedback";
import { Field, Input, Radio, Select, Textarea } from "@/components/ui/field";
import { Dialog, DialogContent } from "@/components/ui/overlay";
import { Panel } from "@/components/ui/surface";
import { useToast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/client/api";
import { PRIORITIES, type Priority } from "@/lib/domain/complaint";
import type { WorkflowInput } from "@/lib/domain/schemas";
import { formatDateTime } from "@/lib/format";
import type { ComplaintView } from "@/lib/server/complaints";

const PRIORITY_LABEL: Record<Priority, string> = {
  critical: "Critical",
  high: "High",
  normal: "Normal",
  low: "Low",
};
const RATINGS = ["Poor", "Not great", "Okay", "Good", "Great"];

/** Posts one workflow action; the server decides whether it's allowed. */
function useAction(id: string, onDone: () => Promise<void>) {
  const toast = useToast();
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const run = async (body: WorkflowInput, done: string) => {
    setBusy(body.type);
    setError(undefined);
    try {
      await api(`/api/complaints/${id}/actions`, { method: "POST", body });
      toast({ title: done });
      await onDone();
      return true;
    } catch (e) {
      const err = e as ApiError;
      setError(err.fields[0]?.message ?? err.message);
      return false;
    } finally {
      setBusy(undefined);
    }
  };
  return { run, busy, error };
}

export function ComplaintActions({
  c,
  onChanged,
}: {
  c: ComplaintView;
  onChanged: () => Promise<void>;
}) {
  const has = (t: WorkflowInput["type"]) => c.actions.includes(t);
  const staff = ["assign", "start", "note", "resolve", "priority", "hide", "unhide"].some((t) =>
    has(t as WorkflowInput["type"]),
  );
  return (
    <>
      {(has("confirm") || has("reopen") || has("feedback")) && (
        <OwnerActions c={c} onChanged={onChanged} />
      )}
      {(staff || has("escalate")) && <StaffActions c={c} onChanged={onChanged} />}
    </>
  );
}

function OwnerActions({ c, onChanged }: { c: ComplaintView; onChanged: () => Promise<void> }) {
  const { run, busy, error } = useAction(c.id, onChanged);
  const [reopening, setReopening] = useState(false);
  const [why, setWhy] = useState("");
  const [rating, setRating] = useState<number>();
  const [comment, setComment] = useState("");

  return (
    <Panel title={c.status === "resolved" ? "Is it fixed?" : "Your complaint"}>
      <div className="flex flex-col gap-4 px-4 pb-4">
        {c.actions.includes("confirm") && (
          <>
            <p>
              <Highlight>The admin marked this resolved.</Highlight> Tell us if it&apos;s really
              fixed.
              {c.workflow.confirmationDeadline && (
                <>
                  {" "}
                  If you don&apos;t reply, it closes on{" "}
                  {formatDateTime(c.workflow.confirmationDeadline)}.
                </>
              )}
            </p>
            {c.workflow.resolutionNote && (
              <p className="rounded-control bg-sheet-sunk p-3 text-sm">
                <span className="font-semibold">What was done: </span>
                {c.workflow.resolutionNote}
              </p>
            )}
          </>
        )}
        <div className="flex flex-wrap gap-3">
          {c.actions.includes("confirm") && (
            <Button
              loading={busy === "confirm"}
              icon={<CheckCircle2 aria-hidden className="size-5" />}
              onClick={() => run({ type: "confirm" }, "Thanks, it's closed")}
            >
              Yes, it&apos;s fixed
            </Button>
          )}
          {c.actions.includes("reopen") && (
            <Button
              variant="secondary"
              icon={<RotateCcw aria-hidden className="size-5" />}
              onClick={() => setReopening(true)}
            >
              It&apos;s still a problem
            </Button>
          )}
        </div>

        {c.actions.includes("feedback") && (
          <form
            className="flex flex-col gap-3 border-t border-rule pt-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (rating)
                run(
                  { type: "feedback", rating, comment: comment || null },
                  "Thanks for the feedback",
                );
            }}
          >
            <fieldset>
              <legend className="font-semibold">How was it handled?</legend>
              <p className="text-sm text-muted">Only you and hostel admins see this.</p>
              <div className="mt-1 flex flex-wrap gap-x-4">
                {RATINGS.map((label, i) => (
                  <Radio
                    key={label}
                    name="rating"
                    label={`${i + 1} · ${label}`}
                    checked={rating === i + 1}
                    onChange={() => setRating(i + 1)}
                  />
                ))}
              </div>
            </fieldset>
            <Field label="Anything to add?">
              <Textarea
                value={comment}
                maxLength={500}
                rows={3}
                onChange={(e) => setComment(e.target.value)}
              />
            </Field>
            <Button
              type="submit"
              variant="secondary"
              className="self-start"
              disabled={!rating}
              loading={busy === "feedback"}
            >
              Send feedback
            </Button>
          </form>
        )}
        {c.workflow.feedback && (
          <p className="text-sm text-muted">
            You rated the handling {c.workflow.feedback.rating}/5.
          </p>
        )}
        {error && <Banner tone="danger" title={error} />}
      </div>

      <Dialog open={reopening} onOpenChange={setReopening}>
        <DialogContent
          title="Reopen this complaint"
          description="It goes back to the admin with a new handling deadline."
        >
          <form
            className="flex flex-col gap-4"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await run({ type: "reopen", note: why || null }, "Reopened")) setReopening(false);
            }}
          >
            <Field label="What's still wrong?">
              <Textarea
                value={why}
                maxLength={1000}
                rows={4}
                onChange={(e) => setWhy(e.target.value)}
              />
            </Field>
            {error && <Banner tone="danger" title={error} />}
            <Button type="submit" loading={busy === "reopen"} className="self-end">
              Reopen
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </Panel>
  );
}

function StaffActions({ c, onChanged }: { c: ComplaintView; onChanged: () => Promise<void> }) {
  const has = (t: WorkflowInput["type"]) => c.actions.includes(t);
  const { run, busy, error } = useAction(c.id, onChanged);
  const [contact, setContact] = useState("");
  const [note, setNote] = useState("");
  const [priority, setPriority] = useState<Priority | "">("");
  const [priorityWhy, setPriorityWhy] = useState("");
  const [hideWhy, setHideWhy] = useState("");
  const [escalateWhy, setEscalateWhy] = useState("");
  const [primary, setPrimary] = useState("");
  const [reporter, setReporter] = useState<{
    name: string;
    rollNumber: string | null;
    room: string;
  }>();
  const clearNote = (ok: boolean) => ok && setNote("");

  return (
    <Panel title="Handle this complaint">
      <div className="flex flex-col gap-5 px-4 pb-4">
        {c.overdue && (
          <Banner tone="warning" title="Overdue">
            Nothing was recorded before the handling target. Assign it or add a note.
          </Banner>
        )}
        {c.workflow.hidden && (
          <Banner tone="info" icon={EyeOff} title="Hidden from the public feed">
            {c.workflow.hiddenReason}
          </Banner>
        )}

        {has("assign") && (
          <Row>
            <Field
              label={c.workflow.assignee ? `Assigned to ${c.workflow.assignee}` : "Assign to"}
              className="flex-1"
            >
              <Select value={contact} onChange={(e) => setContact(e.target.value)}>
                <option value="">Choose a contact</option>
                {c.assignees.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Button
              variant="secondary"
              disabled={!contact}
              loading={busy === "assign"}
              onClick={async () =>
                (await run({ type: "assign", contactId: contact }, "Assigned")) && setContact("")
              }
            >
              {c.workflow.assignee ? "Reassign" : "Assign"}
            </Button>
          </Row>
        )}

        {(has("note") || has("resolve") || has("start")) && (
          <div className="flex flex-col gap-3">
            <Field
              label="Update"
              hint="Shown on the complaint as recorded by admin. Write what the contact told you."
            >
              <Textarea
                value={note}
                maxLength={1000}
                rows={3}
                onChange={(e) => setNote(e.target.value)}
              />
            </Field>
            <div className="flex flex-wrap gap-3">
              {has("start") && (
                <Button
                  variant="secondary"
                  loading={busy === "start"}
                  onClick={async () =>
                    clearNote(
                      await run({ type: "start", note: note || null }, "Marked in progress"),
                    )
                  }
                >
                  Mark in progress
                </Button>
              )}
              {has("note") && (
                <Button
                  variant="secondary"
                  disabled={note.trim().length < 3}
                  loading={busy === "note"}
                  onClick={async () => clearNote(await run({ type: "note", note }, "Note added"))}
                >
                  Add note
                </Button>
              )}
              {has("resolve") && (
                <Button
                  disabled={note.trim().length < 3}
                  loading={busy === "resolve"}
                  icon={<CheckCircle2 aria-hidden className="size-5" />}
                  onClick={async () =>
                    clearNote(await run({ type: "resolve", note }, "Marked resolved"))
                  }
                >
                  Mark resolved
                </Button>
              )}
            </div>
          </div>
        )}

        {has("priority") && (
          <Row>
            <Field label="Change priority" className="w-36">
              <Select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
                <option value="">Choose</option>
                {PRIORITIES.filter((p) => p !== c.priority).map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABEL[p]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Reason (staff only)" className="flex-1">
              <Input
                value={priorityWhy}
                maxLength={500}
                onChange={(e) => setPriorityWhy(e.target.value)}
              />
            </Field>
            <Button
              variant="secondary"
              disabled={!priority || priorityWhy.trim().length < 3}
              loading={busy === "priority"}
              onClick={async () => {
                if (
                  priority &&
                  (await run(
                    { type: "priority", priority, reason: priorityWhy },
                    "Priority changed",
                  ))
                ) {
                  setPriority("");
                  setPriorityWhy("");
                }
              }}
            >
              Change
            </Button>
          </Row>
        )}

        {has("escalate") && (
          <Row>
            <Field
              label="Escalate to the hostel lead"
              className="flex-1"
              hint="Your reason is visible to staff only."
            >
              <Input
                value={escalateWhy}
                maxLength={500}
                onChange={(e) => setEscalateWhy(e.target.value)}
              />
            </Field>
            <Button
              variant="secondary"
              disabled={escalateWhy.trim().length < 3}
              loading={busy === "escalate"}
              icon={<ArrowUpCircle aria-hidden className="size-5" />}
              onClick={async () =>
                (await run({ type: "escalate", reason: escalateWhy }, "Escalated")) &&
                setEscalateWhy("")
              }
            >
              Escalate
            </Button>
          </Row>
        )}

        {has("duplicate") && (
          <Row>
            <Field
              label="Merge into another complaint"
              className="flex-1"
              hint="For the same problem reported twice. This one closes; its support moves to the other."
            >
              <Input
                value={primary}
                maxLength={9}
                placeholder="CR-000123"
                onChange={(e) => setPrimary(e.target.value)}
              />
            </Field>
            <Button
              variant="secondary"
              disabled={!/^cr-\d{6}$/i.test(primary.trim())}
              loading={busy === "duplicate"}
              onClick={async () =>
                (await run({ type: "duplicate", primaryTicketId: primary.trim() }, "Merged")) &&
                setPrimary("")
              }
            >
              Merge
            </Button>
          </Row>
        )}
        {has("anonymize") && (
          <Button
            variant="ghost"
            className="self-start"
            loading={busy === "anonymize"}
            onClick={() => run({ type: "anonymize" }, "Now shown as “A resident”")}
          >
            Show the reporter as &ldquo;A resident&rdquo;
          </Button>
        )}

        {has("hide") && (
          <Row>
            <Field
              label="Hide from the public feed"
              className="flex-1"
              hint="For complaints that name people or break the rules. The reporter still sees it."
            >
              <Input value={hideWhy} maxLength={500} onChange={(e) => setHideWhy(e.target.value)} />
            </Field>
            <Button
              variant="destructive"
              disabled={hideWhy.trim().length < 3}
              loading={busy === "hide"}
              onClick={async () =>
                (await run({ type: "hide", reason: hideWhy }, "Hidden")) && setHideWhy("")
              }
            >
              Hide
            </Button>
          </Row>
        )}
        {has("unhide") && (
          <Button
            variant="secondary"
            className="self-start"
            loading={busy === "unhide"}
            onClick={() => run({ type: "unhide" }, "Visible again")}
          >
            Show in the feed again
          </Button>
        )}

        {c.viewer === "staff" && (
          <div className="flex flex-col gap-2 border-t border-rule pt-4">
            {reporter ? (
              <p>
                <span className="font-semibold">{reporter.name}</span>
                {reporter.rollNumber && ` · ${reporter.rollNumber}`}
                {reporter.room && ` · ${reporter.room}`}
              </p>
            ) : (
              <Button
                variant="ghost"
                className="self-start"
                icon={<UserSearch aria-hidden className="size-5" />}
                onClick={() =>
                  api<typeof reporter>(`/api/complaints/${c.id}/reporter`).then(
                    setReporter,
                    () => {},
                  )
                }
              >
                Show who reported it
              </Button>
            )}
            <p className="text-sm text-muted">
              Only when you need to contact them. Each look is logged.
            </p>
          </div>
        )}
        {error && <Banner tone="danger" title={error} />}
      </div>
    </Panel>
  );
}

function Row({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-end gap-3">{children}</div>;
}
