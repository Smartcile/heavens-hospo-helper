/* HOSPO OPS — Gutenberg block (editor side; rendering is server-side). */
(function (wp) {
	'use strict';

	if (!wp || !wp.blocks) {
		return;
	}

	wp.blocks.registerBlockType('hospo-ops/booking', {
		title: 'HOSPO OPS — Book a table',
		description: 'Table booking widget powered by HOSPO OPS.',
		icon: 'calendar-alt',
		category: 'widgets',
		attributes: {
			service: { type: 'string', default: '' }
		},
		edit: function () {
			return wp.element.createElement(
				'div',
				{ className: 'hospo-ops-block-placeholder' },
				'HOSPO OPS — BOOK A TABLE (renders live on the page)'
			);
		},
		save: function () {
			return null; // Dynamic block — rendered server-side.
		}
	});
})(window.wp);
