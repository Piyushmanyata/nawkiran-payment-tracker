# 12. Recording an absence confirms the Shift

Date: 2026-08-09

## Status

Accepted. Amends ADR-0006 §2 and ADR-0011 §1.

## Context

ADR-0006 made Shift Confirmation an explicit act: the Supervisor taps "mark shift
done", and that tap is the only thing separating *no absences* from *nobody
opened the app*.

It gets forgotten. Four days of live data (5–8 August, 16 company-and-shift
slots) show the failure precisely:

| | slots |
|---|---|
| Absences recorded **and** confirmed | 13 |
| Absences recorded, confirm forgotten | 0 |
| Reads "Not sent" | 3 — all three with **zero** absences |

Nobody has ever recorded absences and then failed to confirm. Every miss is a
Shift where everybody came — which is exactly the case that leaves no evidence
behind, because the Supervisor's only honest output is silence.

So the tap is not uniformly worth removing. It is worth removing everywhere the
system can already tell that somebody did the work, and worth *sharpening*
in the one place it cannot.

## Decision

1. **Recording an absence confirms the Shift.** `upsert_attendance_entry` fills
   `confirmed_by` / `confirmed_at` itself. An absence is proof the Supervisor
   worked the Shift; asking him to then assert it is ceremony.
2. **Set-if-null.** Confirmation records who *first* accounted for the Shift and
   never drifts on later edits. Deleting an entry neither confirms nor
   un-confirms: remove the last absence and the Shift reads "everyone came",
   which is true — somebody looked.
3. **One tap survives, for zero absences only.** A Shift with no absences and no
   confirmation renders as an unanswered question — *"Did anyone miss the day
   shift?"* — with two answers: add an absent worker, or "No, everyone came". It
   disappears the instant an absence exists, so a normal day has no confirmation
   control at all.
4. **Confirming no longer freezes the Shift.** This inverts ADR-0006 §2. It is
   forced, not chosen: with confirmation riding on the first absence, the old
   read-only guard would lock the Supervisor out of recording the second. The
   `CONFIRMED` guards are dropped from both entry RPCs; the 10:00 Lock is now the
   only thing that stops a Supervisor writing.
5. **"Open again" becomes Admin-only.** With a confirmed Shift still editable,
   the Supervisor has nothing to reopen. It survives on the Admin card as the
   undo for a mistaken "everyone came", and `shift_reopened` keeps its meaning
   and its existing audit rows.
6. **One rule for both roles.** An Admin write confirms exactly as a Supervisor
   write does. An Admin write that also confirmed is audited as both
   `entry_created` and `shift_confirmed`, so ADR-0011 §3 still holds and "who
   cleared this" stays answerable — Supervisor writes produce no audit row, so
   the presence of one is itself the signal.
7. **All three submission states survive.** `shiftSubmissionState` is untouched.
   Silence is still never read as full attendance, and ADR-0006 §4 stands: a
   Shift nobody answered stays **Not sent** through the Lock.

## Consequences

- **This does not guarantee the forgetting stops.** All three observed misses
  were zero-absence Shifts, and those still need a tap. What changes is where the
  tap lives: an unanswered question on an otherwise empty screen rather than a
  button below a list. If misses continue, the next lever is reopening the
  no-push decision — deliberately not taken here, because the notification
  budget belongs to payments.
- The word "done" leaves the product. Badges read **Not sent** / **Everyone
  came** / **Sent**, and the `shift_confirmed` audit label reads "Shift sent" —
  it now covers auto-confirmation as well as the explicit answer.
- A confirmed Shift is editable by its Supervisor until 10:00 the next day. The
  small "nothing changes by accident" guard from ADR-0006 §2 is gone; the Lock
  and the audit trail carry that weight alone.
- `getAttendanceDayActions` now takes the entry count. The pure module still owns
  every rule; components render booleans (ADR-0011 consequence preserved).
- NKPL 2026-08-05 day shift is left reading "Not sent" — zero absences, never
  answered, and past the Lock. Backfilling it would fake a confirmation that
  never happened.
