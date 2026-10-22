"use client";

import { Mail, Phone, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { EmergencyNotice } from "@/components/notices";
import { EmptyState, ServiceUnavailable } from "@/components/ui/feedback";
import { Field, Input } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/spinner";
import { Panel, RuledList } from "@/components/ui/surface";
import { api } from "@/lib/client/api";

type Contact = {
  id: string;
  name: string;
  role: string;
  phone: string;
  email: string;
  emergency: boolean;
};

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>();
  const [error, setError] = useState(false);
  const [q, setQ] = useState("");

  useEffect(() => {
    let live = true;
    api<{ contacts: Contact[] }>("/api/contacts").then(
      (r) => live && setContacts(r.contacts),
      () => live && setError(true),
    );
    return () => {
      live = false;
    };
  }, []);

  const needle = q.trim().toLowerCase();
  const shown = (contacts ?? []).filter(
    (c) => !c.emergency && (!needle || `${c.name} ${c.role}`.toLowerCase().includes(needle)),
  );
  const emergency = (contacts ?? []).filter((c) => c.emergency && c.phone);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Contacts</h1>
        <p className="text-muted">
          Who handles what in the hostel. Filing a complaint here doesn&apos;t notify them directly;
          a hostel admin passes it on.
        </p>
      </header>
      {error && <ServiceUnavailable />}
      {contacts && (
        <EmergencyNotice contacts={emergency.map((c) => ({ label: c.name, phone: c.phone }))} />
      )}
      <Field label="Search contacts" quiet>
        <Input
          type="search"
          value={q}
          maxLength={60}
          placeholder="e.g. water, mess"
          onChange={(e) => setQ(e.target.value)}
        />
      </Field>
      <Panel>
        {!contacts ? (
          <div className="p-4">
            <Skeleton className="h-24" />
          </div>
        ) : shown.length === 0 ? (
          <div className="px-4">
            <EmptyState icon={Search} title={needle ? "No contacts match" : "No contacts yet"}>
              {needle ? "Try another word." : "Hostel admins add contacts in Hostel setup."}
            </EmptyState>
          </div>
        ) : (
          <RuledList label="Contacts">
            {shown.map((c) => (
              <li key={c.id} className="flex flex-col gap-1 px-4 py-3">
                <p className="font-semibold">{c.name}</p>
                {c.role && <p className="text-sm text-muted">{c.role}</p>}
                <div className="flex flex-wrap gap-x-4">
                  {c.phone && (
                    <a
                      href={`tel:${c.phone.replace(/\s/g, "")}`}
                      className="inline-flex min-h-11 items-center gap-1.5 text-ink underline underline-offset-2"
                    >
                      <Phone aria-hidden className="size-4" />
                      {c.phone}
                    </a>
                  )}
                  {c.email && (
                    <a
                      href={`mailto:${c.email}`}
                      className="inline-flex min-h-11 items-center gap-1.5 text-ink underline underline-offset-2"
                    >
                      <Mail aria-hidden className="size-4" />
                      {c.email}
                    </a>
                  )}
                </div>
              </li>
            ))}
          </RuledList>
        )}
      </Panel>
    </div>
  );
}
