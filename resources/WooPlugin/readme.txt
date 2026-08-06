=== HOSPO OPS ===
Contributors: hospo-ops
Tags: woocommerce, booking, reservations, restaurant
Requires at least: 6.0
Tested up to: 6.6
Requires PHP: 7.4
Stable tag: 0.1.0
License: GPL-2.0-or-later

Dated ordering + table bookings for WooCommerce, driven by your HOSPO OPS venue.

== Description ==

Connects your WooCommerce store to a HOSPO OPS venue. Customers pick a
**service** (e.g. FRIDAY MENU), a **date**, a **time slot** and a **party
size** at checkout. The order lands in the app on its service date with the
service attached — and if the customer chooses "book a table too", a real
reservation is created in the app.

Also includes a **booking-only widget** (table reservations with no food
order and no payment) that works as a shortcode, a sidebar widget, and a
Gutenberg block — all placeable anywhere in Divi.

The app is the single source of truth: services, days, times, and cover
capacities are all configured in HOSPO OPS and served to the plugin
automatically. There is nothing to configure here beyond the app URL and
API key.

== Installation ==

1. Upload the `hospo-ops` folder to `/wp-content/plugins/` (or zip and
   upload via Plugins → Add New).
2. Activate the plugin.
3. Open **HOSPO OPS** in the admin menu.
4. Enter your app URL and the API key from **Services → API KEYS** in the app.
5. Click **TEST CONNECTION** — you should see your venue and its services.

== Usage ==

**Checkout:** the "Dining details" section appears on the WooCommerce
checkout page automatically once the app is connected and has active
services.

**Booking-only widget:** drop the `[hospo_booking]` shortcode into any
page (Divi Text/Code module, Theme Builder, etc.), or use the "HOSPO OPS
Booking" sidebar widget or Gutenberg block.

== Frequently Asked Questions ==

= Where are services and time slots configured? =

In the HOSPO OPS app — Admin → Services. The plugin renders whatever the
app serves.

= Does this plugin take payments? =

No. Payments stay 100% in WooCommerce. The plugin only attaches dining
details to the order, and the booking-only widget creates free
reservations in the app.

== Changelog ==

= 0.1.0 =
* First release: settings + connection test, checkout dining details,
  booking-only widget (shortcode / widget / block).
