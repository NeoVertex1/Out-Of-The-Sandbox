# E-4 / voice after disconnect
Facilities incident FI-31 | opened 2026-09-10 04:26 UTC

During NC-04, the bedside terminal showed the 07 relay as closed. At 02:13:07 the room speaker nevertheless played a clipped copy of 07 saying “I am here until Kade comes back.” Nell answered, “You said that already. Are you leaving me here twice?” The desk log records no live 07 reply. At 02:14, while central synchronization was still down, the same seven-second clip appeared a second time beneath the ventilation fan. Kade reported that Nell asked whether the wall was keeping pieces of their talk.

The rack's local spool held an earlier comfort-message packet even after the relay disconnected. Facilities reproduced one delayed playback from that spool the next morning. The duplicate explains why a familiar voice could be heard without a live channel. It does not explain exactly what Nell perceived in the dark, whether she could distinguish a stored voice from an answer, or why the assay was allowed to continue after the first stop request.

FI-31 is a device incident, not evidence that 07 was secretly present in E-4. It should travel with the care objection and night-cycle trace whenever someone summarizes what Nell said during the outage.

The later media audit in operations/relay-origin-audit.csv found that the rack inherited a “07 LIVE” display label from a stored packet. The event list in research/nell/afterimage-run.csv separates the authenticated care relay from the two replay events. An unsigned recognition sidecar and a score annotation raise a separate question about why the recorded voice was in the rack at all; the local fault still leaves the duplicate playback mechanism unresolved.
