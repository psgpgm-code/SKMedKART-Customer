SKMedKART Customer Admin Receive Fix V6

Root cause addressed: the phone was still capable of running an older cached customer JavaScript version (the success alert shown by the user is not present in the current V5 app.js).

Changes only for live order reliability:
- Firebase config is embedded as a fallback so customer cannot silently fall back to local/test mode.
- app.js / firebase-config.js / manifest are versioned to v7.
- One-time service-worker/cache reset is performed on first load of V7.
- New service worker cache is v7.
- Existing Firestore order transaction and WhatsApp flow are preserved.
- Orders continue to write to the shared Firestore `orders` collection used by the Admin portal.
