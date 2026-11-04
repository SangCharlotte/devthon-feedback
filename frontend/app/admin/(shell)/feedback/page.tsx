import type { Metadata } from "next";

import { FeedbackInbox, type InboxStart } from "@/components/admin/FeedbackInbox";
import { SEGMENTS, SENTIMENTS } from "@/components/admin/domain";

export const metadata: Metadata = { title: "Feedback · Company X Paints" };

type Params = Record<string, string | string[] | undefined>;

const pick = <T extends string>(value: string | string[] | undefined, options: readonly { id: T }[]) =>
  options.find((o) => o.id === value)?.id;

export default async function Page({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const start: InboxStart = {
    q: typeof params.q === "string" ? params.q : undefined,
    sentiment: pick(params.sentiment, SENTIMENTS),
    segment: pick(params.segment, SEGMENTS),
  };
  // A new ?q= from the top bar search starts a fresh inbox with that query.
  return <FeedbackInbox key={JSON.stringify(start)} start={start} />;
}
