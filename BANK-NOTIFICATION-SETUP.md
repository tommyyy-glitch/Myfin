# HSBC / Hang Seng bank-notification capture

Status: Myfin's review inbox and persistent unlabelled reminder are implemented. Complete HSBC and Hang Seng capture processors have passed 28 synthetic cases in the native Apple Shortcuts runtime. Both native iPhone Notification automations are enabled: HSBC HK and Hang Seng HK. Each reads Notification Body; the green Automation switch was visually verified, and HSBC's enabled state was rechecked after reopening. Installed-app routing and a real bank notification remain to be verified. The parser only suggests a single explicit currency amount and an explicitly labelled last-four card number; it does not infer a merchant, transaction date or purchase type from an unverified bank template.

## Visibility control

Bank notification import is hidden by default, including for existing profiles. Open **Settings → Bank notification import → Show bank notification import** to restore it. Turning the switch off hides the Home entry and bank-draft reminders and blocks capture links from opening a form. Drafts, category rules, card links and posted transactions are retained. The preference is saved per profile and included in backups/transfers.

This Myfin switch cannot turn off the separate iPhone Shortcuts triggers. Those remain enabled unless switched off in Shortcuts; they may still open Myfin, but Myfin will discard the capture fragment without displaying or storing the notice while hidden.

## Daily flow

After enabling the visibility setting, open **Bank inbox** on Home, or tap its pending/unlabelled reminder. Paste a transaction notice (never an OTP), extract suggested fields, review the date, and enter the merchant/description. Save a draft without affecting account balances. Later choose the actual account, transaction type and category and press **Confirm posting**. Category and account are mandatory; transfers/card repayments require distinct source and destination accounts and are not expenses. Dismissal is recoverable. Only explicitly confirmed merchant-category rules and bank/card-last-four account links are remembered.

An inbox reminder remains on Home until pending records are posted or dismissed. This is an in-app reminder, not a scheduled lock-screen notification. Existing uncategorised historical transactions are not reclassified.

## iOS 27+ Shortcuts connection

Create a separate Notification automation for HSBC and Hang Seng. Filter for transaction notices and exclude verification/sign-in messages. The configured processors reject security/sign-in notices locally. Both bank triggers are enabled, but real notification formats, locked-phone delivery and installed-app routing have not yet been verified; review every imported notice and do not treat capture as a complete bank ledger.

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

`python3 scripts/build-bank-shortcuts.py --output-dir <folder> --include-tests` builds both bank helpers and test variants. Test variants only output their generated URL and cannot open it. `--notification-input` builds the full notification-Body workflows; its variable format was verified against the user's official exported HSBC draft. These workflows contain no credentials or user transactions. They do not invent local bank-app picker tokens or write the Shortcuts database. Bank notification triggers must be selected/enabled through the native iPhone interface; this was completed for HSBC HK and Hang Seng HK. Ordinary shortcut actions can sync through iCloud; this does not prove that a device-specific trigger is enabled.

Sign with Apple's built-in `shortcuts sign --mode anyone`; only workflow configuration is submitted to Apple. This mode does not embed contact-only signing information. After importing the TEST workflows, `python3 tests/run-bank-shortcuts-native.py` checks both banks with synthetic text, including JSON escaping, Chinese notices, repayments, OTP/sign-in rejection, empty and oversized input. Native UI import was also verified.

## Security checks for this capture flow

- The shortcut reads only the explicitly selected bank notification Body. It does not use clipboard, files, credentials, bank-login access, shell scripts, remote code or a third-party capture service.
- Matching is bounded to 4,000 characters and requires a transaction term plus an explicit supported currency amount. Security-code, password and sign-in notices are rejected locally before any URL is constructed. Unrecognised formats require manual review/import; synthetic tests are not a guarantee of coverage for every bank notice.
- A Dictionary is serialized to JSON and URL-encoded. Notice text is carried only in the fragment, never query parameters. The receiver strips that fragment immediately, validates the exact bank/text envelope, rejects security notices before rendering, and treats notice text as inert textarea content.
- Paste/parse/save/post share the same security-notice guard. Rejection clears raw and derived fields; closing the inbox clears the unsaved raw notice. Raw notices are not included in saved drafts, backups or cloud sync.
- The capture page loads no third-party executable script. SheetJS 0.20.3 is vendored from its official distribution with its Apache licence; the old external 0.18.5 script was removed. `no-referrer` suppresses outgoing page referrers. Existing opt-in Myfin cloud storage still follows the user's configured account and policies.
- The receiver cannot silently save or post, and cannot choose an account/category from an unknown notification. Confirming an entry remains a deliberate user action. Verify the correct ledger before any confirmation, especially if Shortcuts opens Safari instead of the installed Home Screen app.

These are scoped code, browser and native-runtime checks, not a claim that any system has zero security risk. The native Automation switches are confirmed enabled. Real notification delivery, execution permissions and routing into the intended existing ledger still require an end-to-end device check.
