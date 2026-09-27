# Phone UI continuation — 2026-09-27

Presentation-only update from b3ba6948. Wallet has clearer segmented navigation, a larger search field and touch targets. P&L has larger section controls. Settings uses single-row expandable sections rather than a three-column tile grid. Entry forms have larger close and calculator controls, readable numeric fields and consistent spacing.

All six script blocks are byte-for-byte unchanged. Offline shell cache advanced to v36. No financial or persistence changes.

Validation: 165 unit tests; 8 synthetic viewport/theme comparisons; 8 additional comparisons with a locally supplied phone backup, with external traffic blocked. Monetary output, persisted snapshots and re-exported fields match the baseline. The private source file and financial values are excluded from this repository. Three P&L navigation sizes and 20 startup/safe-area cases also pass.

Native phone backup was exported using iPhone Mirroring and received on the owner's Mac before this release. A second copy was saved using On My iPhone. Secrets are excluded from this account-copy format. Native post-release verification is recorded separately.
