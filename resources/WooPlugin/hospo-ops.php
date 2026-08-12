<?php
/**
 * Plugin Name:       HOSPO OPS
 * Plugin URI:        https://github.com/Smartcile/heavens-hospo-helper
 * Description:       Dated ordering + table bookings for WooCommerce, driven by your HOSPO OPS venue. Customers pick a service, date, time slot and party size at checkout; picking the date and time IS the booking (dine-in only) and creates the reservation in the app. Includes a booking-only widget for pages.
 * Version:           0.3.3
 * Requires at least: 6.0
 * Requires PHP:      7.4
 * Author:            HOSPO OPS
 * License:           GPL-2.0-or-later
 * Text Domain:       hospo-ops
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'HOSPO_OPS_VERSION', '0.3.3' );
define( 'HOSPO_OPS_FILE', __FILE__ );
define( 'HOSPO_OPS_DIR', plugin_dir_path( __FILE__ ) );
define( 'HOSPO_OPS_URL', plugin_dir_url( __FILE__ ) );

require_once HOSPO_OPS_DIR . 'includes/class-hospo-ops-api.php';
require_once HOSPO_OPS_DIR . 'includes/class-hospo-ops-settings.php';
require_once HOSPO_OPS_DIR . 'includes/class-hospo-ops-booking-widget.php';
require_once HOSPO_OPS_DIR . 'includes/class-hospo-ops-checkout.php';
require_once HOSPO_OPS_DIR . 'includes/class-hospo-ops-blocks.php';
require_once HOSPO_OPS_DIR . 'divi/hospo-ops-divi.php';

Hospo_Ops_Blocks::init();

/**
 * The single source of truth for plugin settings.
 * Stored as one wp_options row: hospo_ops_settings.
 */
function hospo_ops_settings() {
	static $settings = null;
	if ( null === $settings ) {
		$defaults = array(
			'app_url'      => '',
			'api_key'      => '',
			'show_checkout' => 1,
		);
		$saved    = get_option( 'hospo_ops_settings', array() );
		$settings = wp_parse_args( is_array( $saved ) ? $saved : array(), $defaults );
	}
	return $settings;
}

/**
 * Shortcut: the configured HOSPO OPS app URL, trailing slash stripped.
 */
function hospo_ops_app_url() {
	return untrailingslashit( trim( (string) hospo_ops_settings()['app_url'] ) );
}

/**
 * The configured API key, trimmed.
 */
function hospo_ops_api_key() {
	return trim( (string) hospo_ops_settings()['api_key'] );
}

function hospo_ops_activate() {
	add_option( 'hospo_ops_settings', array( 'app_url' => '', 'api_key' => '' ) );
}
register_activation_hook( __FILE__, 'hospo_ops_activate' );

// Admin menu lives on its own top-level page under "HOSPO OPS".
add_action( 'admin_menu', array( 'Hospo_Ops_Settings', 'register_menu' ) );
add_action( 'admin_post_hospo_ops_test_connection', array( 'Hospo_Ops_Settings', 'handle_test_connection' ) );
add_action( 'admin_post_hospo_ops_save_settings', array( 'Hospo_Ops_Settings', 'handle_save_settings' ) );
