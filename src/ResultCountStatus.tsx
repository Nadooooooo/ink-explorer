import { useEffect, useState } from "react";

export function ResultCountStatus({ count, t }: { count: number; t: (key: string) => string }) {
  const message = count === 0
    ? t("noRecords")
    : `${t("Records")}: ${count.toLocaleString(document.documentElement.lang)}`;
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    // Announce a settled count after typing rather than every intermediate result.
    const timer = setTimeout(() => setAnnouncement(message), 300);
    return () => clearTimeout(timer);
  }, [message]);

  return <span className="sr-only" role="status" aria-atomic="true" data-result-count="">{announcement}</span>;
}
