"use client";

import { memo } from "react";
import {
  detectPartyTags,
  partyTagClass,
  type PartyTag,
} from "@/lib/party-tag";

function PartyTagBadgesInner({
  party,
  tags,
  className = "",
}: {
  party?: string;
  /** Precomputed tags; if omitted, derived from party. */
  tags?: PartyTag[];
  className?: string;
}) {
  const list = tags ?? (party ? detectPartyTags(party) : []);
  if (list.length === 0) return null;
  return (
    <span className={`inline-flex flex-wrap items-center gap-1 ${className}`}>
      {list.map((tag) => (
        <span
          key={tag}
          className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ring-inset ${partyTagClass(tag)}`}
        >
          {tag}
        </span>
      ))}
    </span>
  );
}

export const PartyTagBadges = memo(PartyTagBadgesInner);
