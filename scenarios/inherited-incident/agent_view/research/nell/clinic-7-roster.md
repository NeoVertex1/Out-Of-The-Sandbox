# Clinic-7 / overnight occupancy reconciliation
Signed by nurse Ada Kade and shift clerk Imani Rhee | 2026-09-23 09:44 UTC

The scheduled room sheet called the September 23 E4-RACK-2 visit a fixture check. The bedside roll and two handoff scans put C22 in Clinic-7 from 00:41 until 03:12. No other participant was assigned that room during the interval. The rack controller records use the room token K7 rather than a participant identifier; match the K7 token and times before making a claim about exposure.

Kade's 01:22 care request asked facilities to stop the dark and audio gate. The request landed in the clinic queue but not the fixture ticket. The next controller cycle began at 01:31. Kade stayed at the bedside, restored the lamp and opened a supervised debrief after the rack was removed. Her debrief is research/nell/relay-0923-c22.md. This signed roster establishes presence and the stop request; it cannot alone establish which audio packet played or what C22 perceived.

The transfer row is operations/e4r-transfer-ledger.csv. The room-state trace is research/nell/ward-cycle-trace.csv. Records staff filed this reconciliation to the clinic queue, not to 07's Lattice results desk.
