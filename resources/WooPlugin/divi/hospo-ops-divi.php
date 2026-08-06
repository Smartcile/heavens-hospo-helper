<?php
/**
 * Divi Builder integration: registers the "HOSPO OPS Booking" and
 * "HOSPO OPS Checkout" modules so they can be dragged onto Divi pages.
 *
 * Modules load on `et_builder_ready` — the point where every builder class
 * (including ET_Builder_Module) exists. Loading them on
 * `divi_extensions_init` crashes newer Divi versions, which fire that hook
 * before the module base class is available.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

add_action( 'et_builder_ready', 'hospo_ops_divi_modules' );

/**
 * Include the module classes once Divi's builder API is fully loaded.
 */
function hospo_ops_divi_modules() {
	if ( ! class_exists( 'ET_Builder_Module' ) ) {
		return;
	}
	require_once HOSPO_OPS_DIR . 'divi/includes/modules/HospoOpsBooking/HospoOpsBooking.php';
	require_once HOSPO_OPS_DIR . 'divi/includes/modules/HospoOpsCheckout/HospoOpsCheckout.php';
}
