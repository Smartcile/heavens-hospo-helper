=== HOSPO OPS ===
Contributors: hospo-ops
Tags: woocommerce, booking, reservations, restaurant
Requires at least: 6.0
Tested up to: 6.6
Requires PHP: 7.4
Stable tag: 0.3.3
License: GPL-2.0-or-later

Dated ordering + table bookings for WooCommerce, driven by your HOSPO OPS venue.

== Description ==

Connects your WooCommerce store to a HOSPO OPS venue. Customers pick a
**service** (e.g. FRIDAY MENU), a **date**, a **time slot** and a **party
size** at checkout. The order lands in the app on its service date with the
service attached — and because dining is dine-in only, picking the date and
time **is** the booking: a real reservation is created in the app, seated on
the service's table plan.

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

= 0.3.3 =
* Fix: the admin order edit screen preloads the saved date's time slots and
  highlights the saved booking time as a selected pill (previously the time
  only existed as a hidden input until a date was clicked).

= 0.3.2 =
* Fix: the admin order edit screen now shows the saved booking time — a
  "BOOKED FOR: <date> @ <time>" line at the top of the DINING DETAILS panel
  (the time used to exist only as a hidden input until a date was clicked).

= 0.3.1 =
* Fix: dining details lost on Divi checkout pages built from the separate
  WooCommerce modules (billing / order details / payment info) — each
  renders its own form.checkout, and the section was relocated into the
  billing form while the order submits from the payment form. The section
  now moves into the form holding #payment, above the review section.

= 0.2.0 =
* Service boxes + date buttons rendered server-side (visible without JS)
* Assets always load on the frontend; version bumped to bust stale caches
* Google-style restyle: party number box, date button pills, service boxes
* Divi modules load on et_builder_ready (fixes fatal on Divi 5)
* Divi module for checkout dining details + settings toggle
* Cart menu detection: "your menu" tag on matching services

= 0.1.0 =
* First release: settings + connection test, checkout dining details,
  booking-only widget (shortcode / widget / block).
