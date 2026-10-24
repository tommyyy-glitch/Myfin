# HSBC / Hang Seng bank-notification capture

Status: Myfin's review inbox and persistent unlabelled reminder are implemented. No phone automation is installed or verified. Bank notification formats still need real, redacted examples. The parser only suggests a single explicit currency amount and an explicitly labelled last-four card number; it does not infer a merchant, transaction date or purchase type from an unverified bank template.

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
