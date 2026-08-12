/* HOSPO OPS — shared frontend for the booking widget and checkout.
   Both render the same flow: party size (number box) → service boxes with
   date buttons → time slot pills → book. */
(function () {
	'use strict';

	var STATE = {
		config: null,
		selected: { serviceId: '', date: '', party: '2', time: '' }
	};

	function esc(str) {
		var div = document.createElement('div');
		div.textContent = String(str == null ? '' : str);
		return div.innerHTML;
	}

	function pad(n) { return n < 10 ? '0' + n : '' + n; }

	function dateKey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }

	function api(action, params) {
		var url = new URL(window.HospoOps.ajaxUrl);
		url.searchParams.set('action', action);
		url.searchParams.set('_wpnonce', window.HospoOps.nonce);
		Object.keys(params).forEach(function (k) { url.searchParams.set(k, params[k]); });
		return fetch(url).then(function (r) {
			return r.json().then(function (data) {
				if (!data.success) {
					var msg = data.data && data.data.error ? data.data.error : 'Request failed';
					throw new Error(msg);
				}
				return data.data;
			});
		});
	}

	function loadConfig() {
		if (STATE.config) return Promise.resolve(STATE.config);
		return api('hospo_ops_config', {}).then(function (cfg) {
			STATE.config = cfg;
			return cfg;
		});
	}

	function fmtTime(hhmm) {
		var parts = hhmm.split(':');
		var h = parseInt(parts[0], 10);
		var m = parts[1] || '00';
		var ampm = h >= 12 ? 'pm' : 'am';
		var hr = h % 12 === 0 ? 12 : h % 12;
		return hr + ':' + m + ' ' + ampm;
	}

	// ── Service boxes with date buttons ──────────────────────────────────

	/**
	 * Wires the server-rendered service boxes: clicking a date button calls
	 * onPick(serviceId, date). The list itself is rendered in PHP so it is
	 * visible even before this script loads.
	 */
	function wireServiceList(servicesEl, onPick) {
		servicesEl.querySelectorAll('.hospo-ops-date-btn').forEach(function (btn) {
			btn.addEventListener('click', function () {
				servicesEl.querySelectorAll('.hospo-ops-date-btn').forEach(function (b) { b.classList.remove('is-selected'); });
				btn.classList.add('is-selected');
				onPick(
					btn.closest('.hospo-ops-service').getAttribute('data-service'),
					btn.getAttribute('data-date')
				);
			});
		});
	}

	// ── Time slot pills ──────────────────────────────────────────────────

	function renderSlots(container, services, selectedServiceId, onChange) {
		var html = '';
		services.forEach(function (svc) {
			if (!svc.slots || svc.slots.length === 0) return;
			svc.slots.forEach(function (slot) {
				// No service selected yet (admin panel preloaded with a saved
				// booking): the saved time pill still highlights by time alone.
				var selected = ('' === selectedServiceId || selectedServiceId === svc.serviceId) && STATE.selected.time === slot.startTime;
				html += '<button type="button" class="hospo-ops-slot' + (selected ? ' is-selected' : '') +
					(slot.available ? '' : ' is-full') + '" data-slot-time="' + esc(slot.startTime) + '"' +
					' data-service="' + esc(svc.serviceId) + '"' +
					(slot.available ? '' : ' disabled') + '>' +
					esc(fmtTime(slot.startTime)) +
					'</button>';
			});
		});
		container.innerHTML = html || '<p class="hospo-ops-note">No times available for this date — please choose another day or call us.</p>';

		container.querySelectorAll('.hospo-ops-slot:not([disabled])').forEach(function (btn) {
			btn.addEventListener('click', function () {
				container.querySelectorAll('.hospo-ops-slot').forEach(function (b) { b.classList.remove('is-selected'); });
				btn.classList.add('is-selected');
				STATE.selected.time = btn.getAttribute('data-slot-time');
				STATE.selected.serviceId = btn.getAttribute('data-service');
				onChange();
			});
		});
	}

	function refreshAvailability(root, onChange) {
		var slotsEl = root.querySelector('[data-hospo-slots]');
		var messageEl = root.querySelector('[data-hospo-message]');
		if (!STATE.selected.date || !STATE.selected.party) return;

		if (messageEl) messageEl.hidden = true;
		slotsEl.innerHTML = '<p class="hospo-ops-note">Loading times…</p>';

		loadAvailability(STATE.selected.date, STATE.selected.party)
			.then(function (data) {
				renderSlots(slotsEl, data.services, STATE.selected.serviceId, onChange);
			})
			.catch(function (err) {
				slotsEl.innerHTML = '';
				if (messageEl) {
					messageEl.textContent = err.message;
					messageEl.classList.add('is-error');
					messageEl.hidden = false;
				}
			});
	}

	function loadAvailability(date, party) {
		return api('hospo_ops_availability', { date: date, party: party });
	}

	// ── Booking-only widget ──────────────────────────────────────────────

	function wireWidget(root) {
		var servicesEl = root.querySelector('[data-hospo-services]');
		var slotsEl = root.querySelector('[data-hospo-slots]');
		var messageEl = root.querySelector('[data-hospo-message]');
		var fieldsEl = root.querySelector('[data-hospo-fields]');
		var partyInput = root.querySelector('[data-hospo-party]');
		var serviceInput = root.querySelector('[data-hospo-service-input]');
		var submitBtn = root.querySelector('[data-hospo-submit]');

		function afterSelection() {
			if (STATE.selected.serviceId && STATE.selected.date && STATE.selected.time) {
				fieldsEl.hidden = false;
			}
		}

		function onAvailability() {
			afterSelection();
		}

		function onPick(serviceId, date) {
			STATE.selected.serviceId = serviceId;
			STATE.selected.date = date;
			STATE.selected.time = '';
			STATE.selected.party = partyInput.value || '2';
			fieldsEl.hidden = true;
			refreshAvailability(root, onAvailability);
		}

		partyInput.addEventListener('change', function () {
			var n = Math.max(1, Math.min(30, parseInt(partyInput.value, 10) || 1));
			partyInput.value = String(n);
			STATE.selected.party = partyInput.value;
			STATE.selected.time = '';
			fieldsEl.hidden = true;
			if (STATE.selected.date) refreshAvailability(root, onAvailability);
		});

		submitBtn.addEventListener('click', function () {
			var name = root.querySelector('[data-hospo-name]').value.trim();
			if (!name) {
				messageEl.textContent = 'Please enter your name.';
				messageEl.classList.add('is-error');
				messageEl.hidden = false;
				return;
			}
			submitBtn.disabled = true;
			api('hospo_ops_book', {
				serviceId: STATE.selected.serviceId,
				date: STATE.selected.date,
				time: STATE.selected.time,
				partySize: STATE.selected.party,
				name: name,
				phone: root.querySelector('[data-hospo-phone]').value.trim(),
				email: root.querySelector('[data-hospo-email]').value.trim()
			}).then(function () {
				messageEl.classList.remove('is-error');
				messageEl.textContent = 'Thanks ' + name.split(' ')[0] + ' — your table is booked. See you then!';
				messageEl.hidden = false;
				fieldsEl.hidden = true;
				slotsEl.innerHTML = '';
				root.querySelector('[data-hospo-name]').value = '';
			}).catch(function (err) {
				messageEl.classList.add('is-error');
				messageEl.textContent = err.message;
				messageEl.hidden = false;
				submitBtn.disabled = false;
			});
		});

		loadConfig().then(function (cfg) {
			if (!cfg.services || cfg.services.length === 0) return;
			wireServiceList(servicesEl, onPick);
		}).catch(function (err) {
			messageEl.textContent = err.message;
			messageEl.classList.add('is-error');
			messageEl.hidden = false;
		});
	}

	// ── Checkout ─────────────────────────────────────────────────────────

	/**
	 * Divi module placement: move the section inside the checkout form so the
	 * hidden inputs submit with the order, just above payment. Returns false
	 * when the form is not on the page yet (Divi 5 can render layouts late).
	 *
	 * Divi's WooCommerce checkout modules render one `form.checkout` per
	 * section (billing, order details, payment info). The form that actually
	 * submits is the one holding #payment and the place-order button — the
	 * fields must live in THAT form, or they never reach the order.
	 */
	function relocateIntoForm(root) {
		if (!root.hasAttribute('data-hospo-relocate')) return true;
		var payment = document.getElementById('payment');
		var form = (payment && payment.closest('form.checkout')) ||
			root.closest('form.checkout') ||
			document.querySelector('form.checkout');
		if (!form) return false;
		// Insert as a direct child of the form, above the review section.
		// #payment is nested inside #order_review, and that container is
		// replaced by WooCommerce's AJAX refresh — a section inside it would
		// be wiped from the submitted form.
		var orderReview = form.querySelector('#order_review');
		if (orderReview) {
			form.insertBefore(root, orderReview);
		} else if (payment && payment.parentNode && form.contains(payment)) {
			payment.parentNode.insertBefore(root, payment);
		} else {
			form.appendChild(root);
		}
		return true;
	}

	function wireCheckout(root) {
		var servicesEl = root.querySelector('[data-hospo-services]');
		var slotsEl = root.querySelector('[data-hospo-slots]');
		var messageEl = root.querySelector('[data-hospo-message]');
		var partyInput = root.querySelector('[data-hospo-party]');
		var menuIds = [];
		try { menuIds = JSON.parse(root.getAttribute('data-hospo-menu-ids') || '[]'); } catch (e) { menuIds = []; }

		// The visible fields have no `name` — their values only reach the
		// order through the hidden inputs synced below. Re-sync at submit and
		// after every WooCommerce AJAX refresh so a missed change event can
		// never post the defaults (e.g. party size stuck at 2). Bind to the
		// submitting form — the one holding #payment — not the first
		// form.checkout on the page (a Divi checkout renders several).
		var paymentEl = document.getElementById('payment');
		var checkoutForm = (paymentEl && paymentEl.closest('form.checkout')) || document.querySelector('form.checkout');
		if (checkoutForm) {
			checkoutForm.addEventListener('checkout_place_order', function () { syncHidden(); });
		}
		if (window.jQuery) {
			window.jQuery(document.body).on('updated_checkout', function () { syncHidden(); });
		}

		// Relocate now, and keep trying — the form may render after us (Divi 5
		// async/lazy layouts, or the module placed before the checkout module).
		if (!relocateIntoForm(root)) {
			var tries = 0;
			var timer = setInterval(function () {
				if (relocateIntoForm(root) || ++tries > 20) clearInterval(timer);
			}, 250);
		}

		function syncHidden() {
			var s = STATE.selected;
			var svc = (STATE.config.services || []).filter(function (x) { return x.id === s.serviceId; })[0];
			var hidden = {
				'_hospo_service_id': s.serviceId,
				'_hospo_service_name': svc ? svc.name : '',
				'_hospo_service_date': s.date,
				'_hospo_service_time': s.time,
				'_hospo_party_size': s.party,
				// Dine-in only: picking a time IS the booking.
				'_hospo_book_table': '1'
			};
			Object.keys(hidden).forEach(function (name) {
				var input = root.querySelector('input[name="' + name + '"]');
				if (input) input.value = hidden[name];
			});
		}

		function afterSelection() {
			var bookInput = root.querySelector('input[name="_hospo_book_table"]');
			if (bookInput) bookInput.value = '1';
			syncHidden();
		}

		function onAvailability() {
			afterSelection();
			syncHidden();
		}

		function onPick(serviceId, date) {
			STATE.selected.serviceId = serviceId;
			STATE.selected.date = date;
			STATE.selected.time = '';
			STATE.selected.party = partyInput.value || '2';
			syncHidden();
			refreshAvailability(root, onAvailability);
		}

		partyInput.addEventListener('change', function () {
			var n = Math.max(1, Math.min(30, parseInt(partyInput.value, 10) || 1));
			partyInput.value = String(n);
			STATE.selected.party = partyInput.value;
			STATE.selected.time = '';
			syncHidden();
			if (STATE.selected.date) refreshAvailability(root, onAvailability);
		});

		loadConfig().then(function (cfg) {
			if (!cfg.services || cfg.services.length === 0) return;
			wireServiceList(servicesEl, onPick);
		}).catch(function (err) {
			messageEl.textContent = err.message;
			messageEl.classList.add('is-error');
			messageEl.hidden = false;
		});
	}

	// ── Admin order edit screen ──────────────────────────────────────────

	function wireAdminPanel(root) {
		var servicesEl = root.querySelector('[data-hospo-services]');
		var slotsEl = root.querySelector('[data-hospo-slots]');
		var dateInput = root.querySelector('input[name="hospo_service_date"]');
		var timeInput = root.querySelector('input[name="hospo_service_time"]');
		var nameInput = root.querySelector('input[name="hospo_service_name"]');
		var partyInput = root.querySelector('[data-hospo-party]');
		if (!servicesEl || !dateInput || !timeInput) return;

		function onPickTime() {
			var svc = (STATE.config.services || []).filter(function (s) { return s.id === STATE.selected.serviceId; })[0];
			dateInput.value = STATE.selected.date;
			timeInput.value = STATE.selected.time;
			var idInput = root.querySelector('input[name="hospo_service_id"]');
			if (idInput && svc) idInput.value = svc.id;
			if (nameInput && svc) nameInput.value = svc.name;
		}

		function onPick(serviceId, date) {
			STATE.selected.serviceId = serviceId;
			STATE.selected.date = date;
			STATE.selected.time = '';
			STATE.selected.party = partyInput ? partyInput.value || '2' : '2';
			refreshAvailability(root, onPickTime);
		}

		loadConfig().then(function (cfg) {
			if (!cfg.services || cfg.services.length === 0) return;
			wireServiceList(servicesEl, onPick);
			if (dateInput.value) {
				servicesEl.querySelectorAll('.hospo-ops-date-btn[data-date="' + dateInput.value + '"]').forEach(function (b) {
					b.classList.add('is-selected');
				});
				// Preload the saved date's slots so the saved booking time is
				// visible as a highlighted pill, not just a hidden input.
				STATE.selected.date = dateInput.value;
				STATE.selected.time = timeInput.value || '';
				STATE.selected.party = partyInput ? partyInput.value || '2' : '2';
				refreshAvailability(root, onPickTime);
			}
		}).catch(function () {});
	}

	document.addEventListener('DOMContentLoaded', function () {
		document.querySelectorAll('[data-hospo-widget]').forEach(wireWidget);
		document.querySelectorAll('[data-hospo-checkout]').forEach(wireCheckout);
		document.querySelectorAll('[data-hospo-admin-panel]').forEach(wireAdminPanel);
	});
})();
