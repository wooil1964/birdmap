# Evidence collector byte-parity assertion

Initial collector assertion required the Windows local indexSha256 to equal the Ubuntu CI indexSha256 and failed. No test expectation or product code was changed. The preserved EOL_SOURCE_PROOF.json establishes exact equality after CRLF-to-LF checkout transformation and matches the original Git blob bytes. Git blob IDs were already identical in PRODUCT_IDENTITY.json.

The 30 case IDs and outcomes match before normalization. This classification is an evidence representation difference, not an executed browser/security FAIL. The final report must retain both raw hashes and canonical Git blob identity.
