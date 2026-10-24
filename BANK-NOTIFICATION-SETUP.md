# HSBC / Hang Seng bank-notification capture

Status: Myfin's review inbox and persistent unlabelled reminder are implemented. Complete HSBC and Hang Seng capture processors have passed 28 synthetic cases in the native Apple Shortcuts runtime. The original HSBC shortcut's actions have been updated through Mac/iCloud sync, and the Hang Seng workflow has been imported. Phone trigger enablement, installed-app routing and a real bank notification remain to be verified. The parser only suggests a single explicit currency amount and an explicitly labelled last-four card number; it does not infer a merchant, transaction date or purchase type from an unverified bank template.

## Daily flow

Open **Bank inbox** on Home, or tap its pending/unlabelled reminder. Paste a transaction notice (never an OTP), extract suggested fields, review the date, and enter the merchant/description. Save a draft without affecting account balances. Later choose the actual account, transaction type and category and press **Confirm posting**. Category and account are mandatory; transfers/card repayments require distinct source and destination accounts and are not expenses. Dismissal is recoverable. Only explicitly confirmed merchant-category rules and bank/card-last-four account links are remembered.

An inbox reminder remains on Home until pending records are posted or dismissed. This is an in-app reminder, not a scheduled lock-screen notification. Existing uncategorised historical transactions are not reclassified.

## iOS 27+ Shortcuts connection

Create a separate Notification automation for HSBC and Hang Seng. Filter for transaction notices and exclude verification/sign-in messages. The selected bank app's actual notification content must be tested before enabling routine capture.

The receiver accepts an **URL-encoded JSON object in the URL fragment**, with exactly these fields:

```json
{"bank":"hsbc","text":"<notification text>"}
```

Use `hangseng` for Hang Seng. Generate JSON with a dictionary/JSON conversion (do not concatenate unescaped notification text), URL-encode that JSON, and open:

```text
https://tommyyy-glitch.github.io/Myfin/#bank-capture=<URL-encoded JSON>
```

The receiver removes the fragment immediately and opens a prefilled form. It never automatically saves or posts. Raw notice text is not included in persisted drafts, backup or sync; normalized transaction fields are stored in the selected profile and follow its existing backup/sync settings.

**First-use check:** verify this opens the intended existing ledger. Shortcuts may open Safari rather than the installed Home Screen app; do not confirm into a different/empty ledger. The browser test proves only the local receiver, not installed-iPhone routing, locked-phone automation or a live bank notification. If routing differs, paste into the installed Myfin inbox until an appropriate handoff is tested.

Apple references: [Notification triggers](https://support.apple.com/guide/shortcuts/event-triggers-apd932ff833f/ios), [automations](https://support.apple.com/guide/shortcuts/add-automations-apdfbdbd7123/ios).

## Reproducible shortcut processors

`python3 scripts/build-bank-shortcuts.py --output-dir <folder> --include-tests` builds both bank helpers and test variants. Test variants only output their generated URL and cannot open it. `--notification-input` builds the full notification-Body workflows; its variable format was verified against the user's official exported HSBC draft. These workflows contain no credentials or user transactions. They do not invent local bank-app picker tokens or write the Shortcuts database. Bank notification triggers still need to be selected/enabled through the native iPhone interface. Ordinary shortcut actions can sync through iCloud; this does not prove that a device-specific trigger is enabled.

Sign with Apple's built-in `shortcuts sign --mode anyone`; only workflow configuration is submitted to Apple. This mode does not embed contact-only signing information. After importing the TEST workflows, `python3 tests/run-bank-shortcuts-native.py` checks both banks with synthetic text, including JSON escaping, Chinese notices, repayments, OTP/sign-in rejection, empty and oversized input. Native UI import was also verified.

## Security checks for this capture flow

- The shortcut reads only the explicitly selected bank notification Body. It does not use clipboard, files, credentials, bank-login access, shell scripts, remote code or a third-party capture service.
- Matching is bounded to 4,000 characters and requires a transaction term plus an explicit supported currency amount. Security-code, password and sign-in notices are rejected locally before any URL is constructed. Unrecognised formats require manual review/import; synthetic tests are not a guarantee of coverage for every bank notice.
- A Dictionary is serialized to JSON and URL-encoded. Notice text is carried only in the fragment, never query parameters. The receiver strips that fragment immediately, validates the exact bank/text envelope, rejects security notices before rendering, and treats notice text as inert textarea content.
- Paste/parse/save/post share the same security-notice guard. Rejection clears raw and derived fields; closing the inbox clears the unsaved raw notice. Raw notices are not included in saved drafts, backups or cloud sync.
- The capture page loads no third-party executable script. SheetJS 0.20.3 is vendored from its official distribution with its Apache licence; the old external 0.18.5 script was removed. `no-referrer` suppresses outgoing page referrers. Existing opt-in Myfin cloud storage still follows the user's configured account and policies.
- The receiver cannot silently save or post, and cannot choose an account/category from an unknown notification. Confirming an entry remains a deliberate user action. Verify the correct ledger before any confirmation, especially if Shortcuts opens Safari instead of the installed Home Screen app.

These are scoped code, browser and native-runtime checks, not a claim that any system has zero security risk. Device permissions, real notification delivery and final enabled status must be verified separately.
