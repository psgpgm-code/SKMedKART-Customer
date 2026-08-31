SKMedKART Customer Final Order Fix V5

Fixed the actual order flow:
- Firestore transaction reads every product first, then performs all writes.
- Stock update and order creation happen in ONE atomic transaction.
- The order document is written to Firestore so Customer Orders and Admin Orders can receive it.
- Local test mode also saves the order locally and creates adminAlerts.
- No navigator.share, navigator.canShare, whatsapp://, or Android share intent.
- WhatsApp opens via the exact HTTPS number 918300363317.
- Cache/app version bumped to v6 to prevent old JavaScript from being served.
