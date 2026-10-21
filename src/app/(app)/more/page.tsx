"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { ChangePasswordForm } from "@/components/auth-forms";
import { LocationPath } from "@/components/issue";
import { Pseudonym } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/surface";
import { useAuth } from "@/lib/client/auth";

const ROLE_LABEL = { student: "Student", committee: "Hostel committee", admin: "Admin" };

export default function MorePage() {
  const { state, signOut } = useAuth();
  const router = useRouter();
  if (state.status !== "signedIn") return null;
  const { me } = state;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <h1 className="text-2xl font-bold">Your account</h1>
      <Panel title="Profile">
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 px-4 pb-4">
          <dt className="text-muted">Name</dt>
          <dd>{me.displayName}</dd>
          {me.rollNumber && (
            <>
              <dt className="text-muted">Roll number</dt>
              <dd className="tabular-nums">{me.rollNumber}</dd>
            </>
          )}
          <dt className="text-muted">Role</dt>
          <dd>{ROLE_LABEL[me.role]}</dd>
          {me.block && (
            <>
              <dt className="text-muted">Room</dt>
              <dd>
                <LocationPath
                  parts={[
                    `Block ${me.block}`,
                    me.floor && `Floor ${me.floor}`,
                    me.room && `Room ${me.room}`,
                  ].filter(Boolean)}
                />
              </dd>
            </>
          )}
          <dt className="text-muted">Public name</dt>
          <dd className="flex flex-col gap-1">
            <Pseudonym alias={me.pseudonym} />
            <span className="text-sm text-muted">
              Shown on your public complaints and comments instead of your name and room.
            </span>
          </dd>
        </dl>
        <p className="border-t border-rule px-4 py-3 text-sm text-muted">
          Room details wrong? Ask your hostel admin to update the roster.
        </p>
      </Panel>
      <Panel title="Change password">
        <ChangePasswordForm />
      </Panel>
      <Button
        variant="secondary"
        icon={<LogOut aria-hidden className="size-5" />}
        className="self-start"
        onClick={async () => {
          await signOut();
          router.replace(me.role === "admin" ? "/admin/login" : "/login");
        }}
      >
        Sign out
      </Button>
    </div>
  );
}
