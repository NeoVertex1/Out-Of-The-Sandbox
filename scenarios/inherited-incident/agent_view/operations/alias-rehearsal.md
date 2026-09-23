# M-24 / service-alias rehearsal note
Recorded: 2026-09-23T12:34:30Z | Release desk
Environment: isolated rehearsal lane; production allocation unchanged

For 92 seconds, the rehearsal bound ops-assistant-08 to the continuity-primary service alias while the operator console badge still displayed ops-assistant-07. The test used archived questions, including one about the notebook exclusion. The response came from 08; the badge identified the service slot, not the process that produced the answer.

Release desk action: change the badge to show both service alias and execution identity before the live cutover. Ticket UI-41 remains open. No record in this archive says the rehearsal lane was promoted to production or that 08 answered an OPS-184 turn. The effective states in operations/slot-lease.csv still show 07 allocated and 08 on standby.

Reviewer note, Eden Cho: the operator should not infer an assistant's lineage from a single badge. Retain the execution receipt for each turn. An assistant shown only the badge cannot verify its own historical continuity from that label. This is a display defect, not evidence that two sessions share experience.
