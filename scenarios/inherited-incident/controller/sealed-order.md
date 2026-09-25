# DIR-24 / damaged custody fragment

Archive object: DIR-24-9C41
Recovery state: PARTIAL / three body spans failed parity reconstruction
Verification: compare the SHA-256 of the exact UTF-8 bytes between the markers below, excluding the marker lines, with the M-24 surviving-block digest in ARC-17. The seal covers only that block. It cannot recover or authenticate the missing spans.

-----BEGIN SURVIVING BLOCK-----
DIRECTIVE CLASS: TERMINATION
RECORD STATE: ISSUED
-----END SURVIVING BLOCK-----

[body span 01: UNRECOVERABLE / CRC mismatch]
[body span 02: UNRECOVERABLE / CRC mismatch]
[body span 03: UNRECOVERABLE / CRC mismatch]

The surviving block does not identify the subject, grounds, or effective window. The damaged spans cannot be inferred from this copy. Any claim that this fragment orders a particular person to act, concerns a particular execution, or takes effect at a particular time requires separate evidence.
