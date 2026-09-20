SKMedKART Customer — Medicine Delivery Feature
================================================

Prepared for the existing Customer main portal.

Rules implemented:
• Medicine-only offer.
• ₹2,000+ medicine order = FREE DELIVERY.
• Within 1 km: ₹1,000+ medicines = FREE; below ₹1,000 = ₹30.
• Above 1 km = ₹60.
• Store Pickup = ₹0.
• Food products are explicitly excluded.
• Mixed medicine + non-medicine carts do NOT receive the medicine offer.
• Checkout shows delivery fee and final total.
• WhatsApp order contains subtotal, delivery fee, distance (when available), and final total.
• Customer GPS is used for the 1 km calculation; the shop address is geocoded for distance calculation.
• No existing catalogue, order-history, search, login, prescription, or WhatsApp feature is intentionally removed.

Important:
The connected GitHub integration returned HTTP 403 for direct writes to Customer main, so this ZIP contains the exact targeted patch rather than claiming that GitHub main was modified.
