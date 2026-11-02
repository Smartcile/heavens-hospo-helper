/* HOSPO OPS — WooCommerce Blocks checkout support.
   The Store API renders our registered fields (service/date/time/party/book)
   as native inputs. This script keeps the options live: service → dates →
   times, fetched from the app. A MutationObserver re-applies the options
   whenever the checkout re-renders, because React rebuilds the selects from
   their registered (static) options. */
(function () {
	'use strict';

	if (!window.wc || !window.wc.blocksCheckout || !window.HospoOps) {
		return;
	}

	var API = {
		ajaxUrl: window.HospoOps.ajaxUrl,
		nonce: window.HospoOps.nonce
	};

	var config = null;
	var state = { serviceId: '', date: '', time: '' };

	var DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
	var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

	function pad(n) { return n < 10 ? '0' + n : '' + n; }

	function dateKey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }

	function api(action, params) {
		var url = new URL(API.ajaxUrl);
		url.searchParams.set('action', action);
		url.searchParams.set('_wpnonce', API.nonce);
		Object.keys(params).forEach(function (k) { url.searchParams.set(k, params[k]); });
		return fetch(url).then(function (r) {
			return r.json().then(function (data) {
				if (!data.success) {
					throw new Error((data.data && data.data.error) || 'Request failed');
				}
				return data.data;
			});
		});
	}

	function loadConfig() {
		if (config) return Promise.resolve(config);
		return api('hospo_ops_config', {}).then(function (cfg) { config = cfg; return cfg; });
	}

	function availableDatesFor(svc, limit) {
		var out = [];
		var now = new Date();
		for (var i = 1; i <= 30 && out.length < limit; i++) {
			var d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
			var key = dateKey(d);
			var ex = (svc.exceptions || []).filter(function (e) { return e.date === key; })[0];
			if (ex) {
				if (ex.closed) continue;
				if (ex.startTime) { out.push(key); continue; }
				continue;
			}
			if ((svc.slots || []).some(function (s) { return s.dayOfWeek === d.getDay(); })) {
				out.push(key);
			}
		}
		return out;
	}

	function fmtDate(key) {
		var d = new Date(key + 'T00:00:00');
		return DAY_NAMES[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()];
	}

	function fmtTime(hhmm) {
		var parts = hhmm.split(':');
		var h = parseInt(parts[0], 10);
		var m = parts[1] || '00';
		var ampm = h >= 12 ? 'pm' : 'am';
		var hr = h % 12 === 0 ? 12 : h % 12;
		return hr + ':' + m + ' ' + ampm;
	}

	// ── Field lookup (rendered by the Store API) ──

	function findField(name) {
		var escaped = 'hospo-ops/' + name;
		var el = document.querySelector('[name="' + escaped + '"]') ||
			document.querySelector('[id="' + escaped.replace(/\//g, '\\/') + '"]') ||
			document.querySelector('[name$="' + name + '"]');
		return el;
	}

	function setOptions(select, options, placeholder) {
		if (!select) return;
		var current = Array.prototype.map.call(select.options, function (o) { return o.value; }).join(',');
		var wanted = options.map(function (o) { return o.value; }).join(',');
		if (current === wanted) return; // already in the desired state
		var prev = select.value;
		select.innerHTML = '';
		var ph = document.createElement('option');
		ph.value = '';
		ph.textContent = placeholder;
		select.appendChild(ph);
		options.forEach(function (o) {
			var opt = document.createElement('option');
			opt.value = o.value;
			opt.textContent = o.label;
			opt.disabled = !!o.disabled;
			select.appendChild(opt);
		});
		select.value = options.some(function (o) { return o.value === prev; }) ? prev : '';
	}

	// ── Option refresh ──

	function refreshAll() {
		if (!config) return;
		var serviceSel = findField('service');
		var dateSel = findField('date');
		var timeSel = findField('time');
		var partyInput = findField('party');
		var idInput = findField('service_id');
		if (!serviceSel || !dateSel || !timeSel) return;

		// Services.
		setOptions(
			serviceSel,
			config.services.map(function (s) { return { value: s.id, label: s.name }; }),
			'Choose a service…'
		);

		var svc = config.services.filter(function (s) { return s.id === (serviceSel.value || state.serviceId); })[0];
		if (svc) {
			state.serviceId = svc.id;
			var dates = availableDatesFor(svc, 8);
			setOptions(
				dateSel,
				dates.map(function (k) { return { value: k, label: fmtDate(k) }; }),
				'Choose a date…'
			);
			var dateKey_ = dateSel.value || state.date;
			if (dateKey_) {
				state.date = dateKey_;
				loadTimes(dateKey_, state.serviceId).then(function (slots) {
					setOptions(
						timeSel,
						slots.map(function (s) { return { value: s.startTime, label: fmtTime(s.startTime), disabled: !s.available }; }),
						'Choose a time…'
					);
				}).catch(function () {
					setOptions(timeSel, [], 'Choose a time…');
				});
			} else {
				setOptions(timeSel, [], 'Choose a time…');
			}
		} else {
			setOptions(dateSel, [], 'Choose a date…');
			setOptions(timeSel, [], 'Choose a time…');
		}

		if (partyInput && !partyInput.value) partyInput.value = '2';
		if (idInput) idInput.value = state.serviceId;
	}

	function loadTimes(date, serviceId) {
		return api('hospo_ops_availability', { date: date, party: 2 }).then(function (data) {
			var svc = (data.services || []).filter(function (s) { return s.serviceId === serviceId; })[0];
			return svc ? svc.slots : [];
		});
	}

	function bind() {
		var serviceSel = findField('service');
		var dateSel = findField('date');
		var timeSel = findField('time');
		if (!serviceSel || !dateSel || !timeSel) return;

		serviceSel.addEventListener('change', function () {
			state.serviceId = serviceSel.value;
			state.date = '';
			state.time = '';
			refreshAll();
		});
		dateSel.addEventListener('change', function () {
			state.date = dateSel.value;
			state.time = '';
			refreshAll();
		});
		timeSel.addEventListener('change', function () {
			state.time = timeSel.value;
			var idInput = findField('service_id');
			if (idInput) idInput.value = state.serviceId;
		});

		// React rebuilds the selects on re-render — re-apply our options.
		var observer = new MutationObserver(function () {
			refreshAll();
		});
		var root = document.querySelector('.wc-block-checkout');
		if (root) {
			observer.observe(root, { childList: true, subtree: true });
		}
		refreshAll();
	}

	loadConfig().then(function () {
		bind();
	}).catch(function () { /* not configured — fields stay empty */ });
})();
