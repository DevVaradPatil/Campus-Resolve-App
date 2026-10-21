// Fixed locale and zone so server and client render identical text (no hydration mismatch).
const dateTime = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Asia/Kolkata",
});

export const formatDateTime = (d: Date | string | number) => dateTime.format(new Date(d));
