// Fixed locale and zone so server and client render identical text (no hydration mismatch).
const dateTime = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Asia/Kolkata",
});

export const formatDateTime = (d: Date | string | number) => dateTime.format(new Date(d));

const day = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  timeZone: "Asia/Kolkata",
});
/** "2026-10-22" (an IST calendar day) → "22 Oct". */
export const formatDay = (isoDay: string) => day.format(new Date(`${isoDay}T12:00:00+05:30`));
