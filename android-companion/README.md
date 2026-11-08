# Finlytics AutoTrack Android companion (prototype)

This is a source project for Android Studio. It does not request `READ_SMS`, `RECEIVE_SMS`, `SEND_SMS`, accessibility-service, or all-files permissions. It uses Android's explicit Notification Access setting and only processes notifications from app package IDs the user selected.

## What it does

- Pair once with Finlytics using a 10-minute single-use code created in the web dashboard.
- Stores the scoped device token and offline event payloads encrypted with AES-GCM using an Android Keystore key.
- Offers Google Pay, PhonePe and Paytm as selectable notification sources.
- Receives future notifications only, parses transaction fields locally, and submits only amount, debit/credit, date, merchant, package ID and an optional reference.
- Never persists or transmits the raw notification text.
- Uses WorkManager to retry transaction event sync when the network returns.

## Build

1. Open this `android-companion` directory in Android Studio.
2. Use JDK 17 and install Android SDK Platform 36 / Build Tools as prompted.
3. Let Gradle sync, then run the `app` configuration on an Android 8.0+ device.
4. In Finlytics web, open `/autotrack` and generate a pairing code.
5. Enter the web URL and code in the Android companion, pair the phone, select the apps and save.
6. Review the disclosure and checkbox, then open Android Notification Access settings and enable Finlytics AutoTrack.

## Important limitations

- This companion is a prototype source project; it has not been signed, published, or independently tested on a physical Android device.
- Notification wording and package IDs can vary by app/device/region. Parser coverage is intentionally conservative: ambiguous notifications are ignored.
- Only future visible notifications can be observed. The app cannot retrieve old payment history or force a UPI app to show notifications.
- Auto-import is off by default. When enabled in the web dashboard, only events with a UPI reference/UTR are automatically imported. Notifications without a reference wait in the web review queue.
- Notification Access is a powerful special access. A production Play Store release requires a thorough Data Safety / prominent disclosure / consent review and Play policy review. Do not promise Play approval.
- For reliable bank-sourced transaction coverage across UPI apps, integrate with an eligible Account Aggregator/FIU partner. This is not implemented by the prototype.

## Privacy

The app sends no raw text, notification extras, bank credentials, UPI PIN, SMS, OTP, or full notification content. The notification text is only read into memory during parsing and then discarded. User can disable Notification Access in Android Settings and revoke the device in Finlytics web.
