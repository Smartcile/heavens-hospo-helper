/* HOSPO OPS — shared frontend for the booking widget and checkout. */
(function () {
	'use strict';

	var STATE = {
		config: null,
		availability: null,
		selected: { serviceId: '', date: '', party: '2', time: '' }
	};

	function esc(str) {
		var div = document.createElement('div');
		div.textContent = String(str == null ? '' : str);
		return div.innerHTML;
	}

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

	function loadAvailability(date, party, serviceId) {
		return api('hospo_ops_availability', { date: date, party: party, serviceId: serviceId });
	}

	function fmtTime(hhmm) {
		var parts = hhmm.split(':');
		var h = parseInt(parts[0], 10);
		var m = parts[1] || '00';
		var ampm = h >= 12 ? 'pm' : 'am';
		var hr = h % 12 === 0 ? 12 : h % 12;
		return hr + ':' + m + ' ' + ampm;
	}

	function renderSlots(container, services, selectedServiceId, onChange) {
		var html = '';
		services.forEach(function (svc) {
			var open = svc.slots && svc.slots.length > 0;
			if (!open) return;
			html += '<div class="hospo-ops-service" data-service="' + esc(svc.serviceId) + '">';
			html += '<div class="hospo-ops-service-name">' + esc(svc.serviceName) +
				(svc.menuName ? ' <span class="hospo-ops-menu">' + esc(svc.menuName) + '</span>' : '') +
				(svc.requiresBooking ? ' <span class="hospo-ops-req">table booking required</span>' : '') +
				'</div>';
			html += '<div class="hospo-ops-slots-grid">';
			svc.slots.forEach(function (slot) {
				var selected = selectedServiceId === svc.serviceId && STATE.selected.time === slot.startTime;
				html += '<button type="button" class="hospo-ops-slot' + (selected ? ' is-selected' : '') +
					(slot.available ? '' : ' is-full') + '" data-slot-time="' + esc(slot.startTime) + '"' +
					(slot.available ? '' : ' disabled') + '>' +
					esc(fmtTime(slot.startTime)) +
					'<span class="hospo-ops-left">' + slot.remaining + ' left</span>' +
					'</button>';
			});
			html += '</div></div>';
		});
		container.innerHTML = html || '<p class="hospo-ops-note">No times available for this date — please choose another day or call us.</p>';

		container.querySelectorAll('.hospo-ops-slot:not([disabled])').forEach(function (btn) {
			btn.addEventListener('click', function () {
				container.querySelectorAll('.hospo-ops-slot').forEach(function (b) { b.classList.remove('is-selected'); });
				btn.classList.add('is-selected');
				STATE.selected.time = btn.getAttribute('data-slot-time');
				STATE.selected.serviceId = btn.closest('.hospo-ops-service').getAttribute('data-service');
				onChange();
			});
		});
	}

	function refreshAvailability(scope, onChange) {
		var root = scope.root;
		var slotsEl = root.querySelector('[data-hospo-slots]');
		var messageEl = root.querySelector('[data-hospo-message]');
		if (!STATE.selected.date || !STATE.selected.party) return;

		messageEl.hidden = true;
		slotsEl.hidden = false;
		slotsEl.innerHTML = '<p class="hospo-ops-note">Loading times…</p>';

		loadAvailability(STATE.selected.date, STATE.selected.party)
			.then(function (data) {
				var serviceId = STATE.selected.serviceId;
				renderSlots(slotsEl, data.services, serviceId, onChange);
			})
			.catch(function (err) {
				slotsEl.hidden = true;
				messageEl.textContent = err.message;
				messageEl.classList.add('is-error');
				messageEl.hidden = false;
			});
	}

	function wireCheckout(root) {
		var slotsEl = root.querySelector('[data-hospo-slots]');
		var messageEl = root.querySelector('[data-hospo-message]');
		var serviceSel = root.querySelector('[data-hospo-service]');
		var dateInput = root.querySelector('[data-hospo-date]');
		var partySel = root.querySelector('[data-hospo-party]');
		var bookRow = document.createElement('div');
		bookRow.className = 'hospo-ops-book-row';
		bookRow.hidden = true;
		bookRow.innerHTML =
			'<label class="hospo-ops-book-label"><input type="checkbox" data-hospo-book-table /> Book a table too</label>' +
			'<p class="hospo-ops-note" data-hospo-book-note hidden></p>';
		slotsEl.parentNode.insertBefore(bookRow, slotsEl.nextSibling);

		function syncHidden() {
			var s = STATE.selected;
			var hidden = {
				'_hospo_service_id': s.serviceId,
				'_hospo_service_date': s.date,
				'_hospo_service_time': s.time,
				'_hospo_party_size': s.party
			};
			Object.keys(hidden).forEach(function (name) {
				var input = root.querySelector('input[name="' + name + '"]');
				if (input) input.value = hidden[name];
			});
			var bookInput = root.querySelector('input[name="_hospo_book_table"]');
			var checkbox = bookRow.querySelector('[data-hospo-book-table]');
			if (bookInput && checkbox) {
				bookInput.value = checkbox.checked ? '1' : '';
			}
		}

		function afterSelection() {
			var svc = (STATE.config.services || []).filter(function (s) { return s.id === STATE.selected.serviceId; })[0];
			if (svc && svc.requiresBooking) {
				bookRow.hidden = false;
				var cb = bookRow.querySelector('[data-hospo-book-table]');
				var note = bookRow.querySelector('[data-hospo-book-note]');
				cb.checked = true;
				cb.disabled = true;
				note.hidden = false;
				note.textContent = 'This service includes a table booking.';
			} else if (svc) {
				bookRow.hidden = false;
				var cb2 = bookRow.querySelector('[data-hospo-book-table]');
				cb2.checked = false;
				cb2.disabled = false;
				bookRow.querySelector('[data-hospo-book-note]').hidden = true;
			}
			syncHidden();
		}

		function onAvailability() {
			afterSelection();
			syncHidden();
		}

		serviceSel.addEventListener('change', function () {
			STATE.selected.serviceId = serviceSel.value;
			STATE.selected.time = '';
			syncHidden();
			if (STATE.selected.date) refreshAvailability(root, onAvailability);
		});
		dateInput.addEventListener('change', function () {
			STATE.selected.date = dateInput.value;
			STATE.selected.time = '';
			syncHidden();
			if (STATE.selected.serviceId || serviceSel.options.length === 2) refreshAvailability(root, onAvailability);
		});
		partySel.addEventListener('change', function () {
			STATE.selected.party = partySel.value;
			STATE.selected.time = '';
			syncHidden();
			if (STATE.selected.date) refreshAvailability(root, onAvailability);
		});
		bookRow.querySelector('[data-hospo-book-table]').addEventListener('change', syncHidden);

		if (serviceSel.options.length === 2) {
			STATE.selected.serviceId = serviceSel.value = serviceSel.options[1].value;
		}
		loadConfig().then(function (cfg) {
			if (!cfg.services || cfg.services.length === 0) return;
			dateInput.disabled = false;
			if (STATE.selected.serviceId) {
				serviceSel.value = STATE.selected.serviceId;
				if (dateInput.value) refreshAvailability(root, onAvailability);
			}
		}).catch(function (err) {
			messageEl.textContent = err.message;
			messageEl.classList.add('is-error');
			messageEl.hidden = false;
		});
	}

	function wireWidget(root) {
		var slotsEl = root.querySelector('[data-hospo-slots]');
		var messageEl = root.querySelector('[data-hospo-message]');
		var fieldsEl = root.querySelector('[data-hospo-fields]');
		var dateInput = root.querySelector('[data-hospo-date]');
		var partySel = root.querySelector('[data-hospo-party]');
		var serviceSel = root.querySelector('[data-hospo-service]');
		var serviceInput = root.querySelector('[data-hospo-service-input]');
		var submitBtn = root.querySelector('[data-hospo-submit]');

		function afterSelection() {
			if (STATE.selected.serviceId && STATE.selected.date && STATE.selected.time) {
				fieldsEl.hidden = false;
			}
		}

		function onAvailability() {
			afterSelection();
			if (serviceSel) serviceSel.value = STATE.selected.serviceId;
			serviceInput.value = STATE.selected.serviceId;
		}

		if (serviceSel) {
			serviceSel.addEventListener('change', function () {
				STATE.selected.serviceId = serviceSel.value;
				STATE.selected.time = '';
				if (STATE.selected.date) refreshAvailability(root, onAvailability);
			});
		}
		dateInput.addEventListener('change', function () {
			STATE.selected.date = dateInput.value;
			STATE.selected.time = '';
			fieldsEl.hidden = true;
			refreshAvailability(root, onAvailability);
		});
		partySel.addEventListener('change', function () {
			STATE.selected.party = partySel.value;
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
			if (serviceSel && serviceSel.options.length === 2) {
				STATE.selected.serviceId = serviceSel.value = serviceSel.options[1].value;
			}
			if (serviceInput && serviceInput.value) {
				STATE.selected.serviceId = serviceInput.value;
				if (serviceSel) serviceSel.value = serviceInput.value;
			}
		}).catch(function (err) {
			messageEl.textContent = err.message;
			messageEl.classList.add('is-error');
			messageEl.hidden = false;
		});
	}

	document.addEventListener('DOMContentLoaded', function () {
		document.querySelectorAll('[data-hospo-widget]').forEach(wireWidget);
		document.querySelectorAll('[data-hospo-checkout]').forEach(wireCheckout);
	});
})();
