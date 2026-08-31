SKMedKART CUSTOMER V12 — FINAL ORDER SYNC FIX

This package is based on V11 stable order-receive source and fixes the customer-side issues reported on 31-Aug-2026:
1. Customer order is written to the shared skmedkart Firestore /orders collection before WhatsApp opens.
2. Order uses the SKM order number as the Firestore document ID and is verified with getDoc().
3. My Orders keeps a local confirmed copy and merges Firebase orders, so a temporary Firestore read/listener failure does not blank the page.
4. Customer profile is stored under a stable non-versioned localStorage key, so refresh does not log the customer out.
5. Prescription upload runs after the Firestore order is created; Storage failure cannot prevent Admin from receiving the order.
6. Customer does NOT deduct stock. Admin reserves stock when the admin moves the order to Confirmed/Ready/Out for Delivery.
7. PWA cache is V12 and network-first for same-origin files; old V1/V11 caches are removed on service-worker activation.
8. No Admin Portal files are changed.

Deploy ALL files in this folder to the Customer GitHub Pages repository. Do not mix V10 files with this package.
