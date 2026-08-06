<?php
/**
 * Checkout integration: the customer picks a service, date, time slot and
 * party size on the checkout page. Values are written to the order as
 * `_hospo_*` meta, which the app's ORDER FIELD MAPPING reads by default.
 */
class Hospo_Ops_Checkout {

	const NONCE_ACTION = 'hospo_ops_public';

	public static function init() {
		add_action( 'woocommerce_after_order_notes', array( __CLASS__, 'render_fields' ) );
		add_action( 'woocommerce_checkout_process', array( __CLASS__, 'validate_fields' ) );
		add_action( 'woocommerce_checkout_create_order', array( __CLASS__, 'save_order_meta' ), 10, 2 );
		add_action( 'woocommerce_email_after_order_table', array( __CLASS__, 'email_dining_details' ), 10, 3 );
		add_action( 'woocommerce_admin_order_data_after_order_details', array( __CLASS__, 'admin_order_details' ), 10, 1 );
		add_action( 'woocommerce_process_shop_order_meta', array( __CLASS__, 'admin_save_order_details' ), 10, 2 );

		// Admin: a column on the orders list.
		add_filter( 'manage_edit-shop_order_columns', array( __CLASS__, 'order_column' ) );
		add_action( 'manage_shop_order_posts_custom_column', array( __CLASS__, 'order_column_content' ), 10, 2 );
	}

	// ── Checkout fields ──────────────────────────────────────────────────

	public static function render_fields( $checkout ) {
		if ( empty( hospo_ops_settings()['show_checkout'] ) ) {
			return; // The venue places the HOSPO OPS Checkout Divi module instead.
		}
		echo self::render_section(); // phpcs:ignore
	}

	/**
	 * The dining details block. `$relocate` marks it for the frontend script
	 * to move inside the checkout form (Divi module placement) — the fields
	 * must live in the form to submit with the order.
	 */
	public static function render_section( $relocate = false ) {
		// Only ever on the checkout form itself — never on the order-received
		// (thank you) page, and never outside the checkout page.
		if ( ! function_exists( 'is_checkout' ) || ! is_checkout() ) {
			return '';
		}
		if ( function_exists( 'is_order_received_page' ) && is_order_received_page() ) {
			return '';
		}

		$config = self::config();
		if ( is_wp_error( $config ) || empty( $config['services'] ) ) {
			return ''; // Not configured, or no active services — nothing to show.
		}

		$menu_ids = self::cart_menu_ids( $config );

		ob_start();
		?>
		<div class="hospo-ops-checkout" data-hospo-checkout<?php echo $relocate ? ' data-hospo-relocate' : ''; ?> data-hospo-menu-ids="<?php echo esc_attr( wp_json_encode( $menu_ids ) ); ?>">
			<h3>Dining details</h3>

			<div class="hospo-ops-row">
				<div class="hospo-ops-field">
					<label for="hospo_order_party">Party size</label>
					<input type="number" id="hospo_order_party" data-hospo-party min="1" max="30" step="1" value="2" />
				</div>
			</div>

			<div class="hospo-ops-section">
				<label class="hospo-ops-label">Service</label>
				<div class="hospo-ops-services" data-hospo-services>
					<?php echo Hospo_Ops_Booking_Widget::render_service_list( $config['services'], $menu_ids ); // phpcs:ignore ?>
				</div>
			</div>

			<div class="hospo-ops-slots" data-hospo-slots></div>

			<p class="hospo-ops-message" data-hospo-message hidden></p>

			<input type="hidden" name="_hospo_service_id" value="" />
			<input type="hidden" name="_hospo_service_name" value="" />
			<input type="hidden" name="_hospo_service_date" value="" />
			<input type="hidden" name="_hospo_service_time" value="" />
			<input type="hidden" name="_hospo_party_size" value="" />
			<input type="hidden" name="_hospo_book_table" value="" />
		</div>
		<?php
		return ob_get_clean();
	}

	/**
	 * Menu mode: the cart contains products from one of the venue's service
	 * menus (matched by WooCommerce category id). Returns the ids of the
	 * services whose menu is in the cart — empty means normal mode.
	 */
	private static function cart_menu_ids( $config ) {
		if ( ! function_exists( 'WC' ) || ! WC()->cart || WC()->cart->is_empty() ) {
			return array();
		}
		$category_ids = array();
		foreach ( WC()->cart->get_cart() as $item ) {
			$product = isset( $item['data'] ) && $item['data'] instanceof WC_Product ? $item['data'] : null;
			if ( ! $product ) {
				continue;
			}
			foreach ( $product->get_category_ids() as $cid ) {
				$category_ids[] = (string) $cid;
			}
		}
		if ( empty( $category_ids ) ) {
			return array();
		}
		$ids = array();
		foreach ( $config['services'] as $service ) {
			if ( ! empty( $service['wooCategoryId'] ) && in_array( (string) $service['wooCategoryId'], $category_ids, true ) ) {
				$ids[] = $service['id'];
			}
		}
		return $ids;
	}

	public static function validate_fields() {
		// Only when the dining section is actually on the page do we require it.
		if ( ! isset( $_POST['_hospo_service_id'] ) ) {
			return;
		}

		$service_id = isset( $_POST['_hospo_service_id'] ) ? sanitize_text_field( wp_unslash( $_POST['_hospo_service_id'] ) ) : '';
		$date       = isset( $_POST['_hospo_service_date'] ) ? sanitize_text_field( wp_unslash( $_POST['_hospo_service_date'] ) ) : '';
		$time       = isset( $_POST['_hospo_service_time'] ) ? sanitize_text_field( wp_unslash( $_POST['_hospo_service_time'] ) ) : '';

		$config = self::config();
		if ( is_wp_error( $config ) || empty( $config['services'] ) ) {
			return; // Services not configured — the app simply won't have a service.
		}

		if ( ! $service_id || ! $date || ! $time ) {
			wc_add_notice( 'Please choose your dining service, date and time slot.', 'error' );
			return;
		}
		if ( ! preg_match( '/^\d{4}-\d{2}-\d{2}$/', $date ) ) {
			wc_add_notice( 'Please pick a valid dining date.', 'error' );
		}
	}

	public static function save_order_meta( $order, $data ) {
		$fields = array(
			'_hospo_service_id'   => 'sanitize_text_field',
			'_hospo_service_name' => 'sanitize_text_field',
			'_hospo_service_date' => 'sanitize_text_field',
			'_hospo_service_time' => 'sanitize_text_field',
			'_hospo_party_size'   => 'absint',
			'_hospo_book_table'   => 'sanitize_text_field',
		);

		foreach ( $fields as $key => $sanitizer ) {
			if ( isset( $_POST[ $key ] ) && '' !== $_POST[ $key ] ) {
				$order->update_meta_data( $key, call_user_func( $sanitizer, wp_unslash( $_POST[ $key ] ) ) );
			}
		}

		// Diagnostic: dining fields missing from the POST — the section is
		// either not inside the checkout form, or the script never ran.
		if ( ! isset( $_POST['_hospo_service_date'] ) && function_exists( 'wc_get_logger' ) ) {
			wc_get_logger()->warning(
				'HOSPO OPS: no _hospo_* fields in checkout POST (order ' . $order->get_id() . '). Check the checkout is classic shortcode, not Blocks, and the frontend script loaded.',
				array( 'source' => 'hospo-ops' )
			);
		}
	}

	/**
	 * Editable dining details on the admin order edit screen — same service
	 * boxes + date buttons + time pills as the frontend, no calendar. Always
	 * shown so undated orders can be given a service date by hand.
	 */
	public static function admin_order_details( $order ) {
		if ( ! $order || ! method_exists( $order, 'get_meta' ) ) {
			return;
		}
		$config  = Hospo_Ops_Booking_Widget::cached_config();
		$date    = $order->get_meta( '_hospo_service_date' );
		$time    = $order->get_meta( '_hospo_service_time' );
		$party   = $order->get_meta( '_hospo_party_size' );
		$book    = in_array( strtolower( (string) $order->get_meta( '_hospo_book_table' ) ), array( '1', 'yes', 'true', 'on' ), true );
		$no_cfg  = is_wp_error( $config ) || empty( $config['services'] );
		?>
		<div class="hospo-ops-checkout hospo-admin-dining" data-hospo-admin-panel style="margin-top:14px;padding-top:12px;border-top:1px dashed #d0d0d0;max-width:none;box-shadow:none;">
			<h3 style="font-size:13px;font-weight:600;margin:0 0 10px;">DINING DETAILS</h3>

			<?php if ( $no_cfg ) : ?>
				<p style="font-size:12px;color:#757575;margin:0;">
					No services available from the app right now. You can still set a date and time by hand:
				</p>
				<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px;">
					<input type="date" name="hospo_service_date" value="<?php echo esc_attr( $date ); ?>" style="width:100%;padding:4px 8px;border:1px solid #ddd;" />
					<input type="time" name="hospo_service_time" value="<?php echo esc_attr( $time ); ?>" style="width:100%;padding:4px 8px;border:1px solid #ddd;" />
				</div>
			<?php else : ?>
				<p style="font-size:12px;color:#757575;margin:0 0 8px;">Pick a service and a date — the times appear below.</p>
				<div data-hospo-services>
					<?php echo Hospo_Ops_Booking_Widget::render_service_list( $config['services'], array(), '' ); // phpcs:ignore ?>
				</div>
				<div data-hospo-slots></div>
				<input type="hidden" name="hospo_service_id" value="" />
				<input type="hidden" name="hospo_service_date" value="<?php echo esc_attr( $date ); ?>" />
				<input type="hidden" name="hospo_service_time" value="<?php echo esc_attr( $time ); ?>" />
				<input type="hidden" name="hospo_service_name" value="" />
			<?php endif; ?>

			<div style="display:grid;grid-template-columns:1fr auto;gap:8px;align-items:end;margin-top:10px;">
				<p class="form-field" style="margin:0;">
					<label style="display:block;font-size:12px;color:#757575;margin-bottom:2px;">Party size</label>
					<input type="number" name="hospo_party_size" min="1" max="500" value="<?php echo esc_attr( $party ); ?>" data-hospo-party style="width:100%;padding:4px 8px;border:1px solid #ddd;" />
				</p>
				<label style="font-size:12px;color:#757575;padding-bottom:5px;white-space:nowrap;">
					<input type="checkbox" name="hospo_book_table" value="1" <?php checked( $book ); ?> /> Book a table
				</label>
			</div>
			<p style="font-size:11px;color:#757575;margin:8px 0 0;">
				Saved with the order — the app picks the change up on its next sync.
			</p>
		</div>
		<?php
	}

	/**
	 * Saves the admin-edited dining details. Runs inside WooCommerce's own
	 * order save flow (nonce already verified).
	 */
	public static function admin_save_order_details( $order_id, $order ) {
		if ( ! isset( $_POST['hospo_service_date'] ) && ! isset( $_POST['hospo_party_size'] ) ) {
			return; // Panel not part of this form.
		}
		$order = wc_get_order( $order_id );
		if ( ! $order ) {
			return;
		}

		if ( isset( $_POST['hospo_service_id'] ) && '' !== $_POST['hospo_service_id'] ) {
			$order->update_meta_data( '_hospo_service_id', sanitize_text_field( wp_unslash( $_POST['hospo_service_id'] ) ) );
		}
		if ( isset( $_POST['hospo_service_date'] ) ) {
			$order->update_meta_data( '_hospo_service_date', sanitize_text_field( wp_unslash( $_POST['hospo_service_date'] ) ) );
		}
		if ( isset( $_POST['hospo_service_time'] ) ) {
			$order->update_meta_data( '_hospo_service_time', sanitize_text_field( wp_unslash( $_POST['hospo_service_time'] ) ) );
		}
		if ( isset( $_POST['hospo_service_name'] ) && '' !== $_POST['hospo_service_name'] ) {
			$order->update_meta_data( '_hospo_service_name', sanitize_text_field( wp_unslash( $_POST['hospo_service_name'] ) ) );
		}
		if ( isset( $_POST['hospo_party_size'] ) ) {
			$party = absint( $_POST['hospo_party_size'] );
			if ( $party > 0 ) {
				$order->update_meta_data( '_hospo_party_size', $party );
			}
		}
		$order->update_meta_data( '_hospo_book_table', empty( $_POST['hospo_book_table'] ) ? '' : '1' );
		$order->save();
	}

	/**
	 * Dining details in every order email (new order, processing, completed…).
	 */
	public static function email_dining_details( $order, $sent_to_admin, $plain_text ) {
		if ( ! $order || ! method_exists( $order, 'get_meta' ) ) {
			return;
		}
		$date = $order->get_meta( '_hospo_service_date' );
		$time = $order->get_meta( '_hospo_service_time' );
		if ( ! $date && ! $time ) {
			return; // Not a dated order — nothing to show.
		}

		$service = $order->get_meta( '_hospo_service_name' );
		$party   = $order->get_meta( '_hospo_party_size' );
		$book    = in_array( strtolower( (string) $order->get_meta( '_hospo_book_table' ) ), array( '1', 'yes', 'true', 'on' ), true );

		if ( $plain_text ) {
			echo "\nDINING DETAILS\n";
			if ( $service ) {
				echo 'Service: ' . esc_html( $service ) . "\n";
			}
			echo 'Date: ' . esc_html( $date ) . "\n";
			echo 'Time: ' . esc_html( $time ) . "\n";
			if ( $party ) {
				echo 'Party size: ' . esc_html( $party ) . "\n";
			}
			if ( $book ) {
				echo "Table: booked\n";
			}
			echo "\n";
			return;
		}
		?>
		<div style="margin-top:24px;">
			<h2 style="font-size:16px;font-weight:600;color:#202124;margin:0 0 8px;">DINING DETAILS</h2>
			<table style="width:100%;border-collapse:collapse;border:1px solid #e0e0e0;font-size:14px;color:#202124;">
				<?php if ( $service ) : ?>
					<tr>
						<td style="padding:8px 12px;border-bottom:1px solid #f1f1f1;color:#5f6368;">Service</td>
						<td style="padding:8px 12px;border-bottom:1px solid #f1f1f1;font-weight:600;"><?php echo esc_html( $service ); ?></td>
					</tr>
				<?php endif; ?>
				<tr>
					<td style="padding:8px 12px;border-bottom:1px solid #f1f1f1;color:#5f6368;">Date</td>
					<td style="padding:8px 12px;border-bottom:1px solid #f1f1f1;font-weight:600;"><?php echo esc_html( $date ); ?></td>
				</tr>
				<tr>
					<td style="padding:8px 12px;border-bottom:1px solid #f1f1f1;color:#5f6368;">Time</td>
					<td style="padding:8px 12px;border-bottom:1px solid #f1f1f1;font-weight:600;"><?php echo esc_html( $time ); ?></td>
				</tr>
				<?php if ( $party ) : ?>
					<tr>
						<td style="padding:8px 12px;border-bottom:1px solid #f1f1f1;color:#5f6368;">Party size</td>
						<td style="padding:8px 12px;border-bottom:1px solid #f1f1f1;font-weight:600;"><?php echo esc_html( $party ); ?></td>
					</tr>
				<?php endif; ?>
				<tr>
					<td style="padding:8px 12px;color:#5f6368;">Table</td>
					<td style="padding:8px 12px;font-weight:600;"><?php echo $book ? 'Booked for you' : 'Not required'; ?></td>
				</tr>
			</table>
		</div>
		<?php
	}

	// ── Admin orders list column ─────────────────────────────────────────

	public static function order_column( $columns ) {
		$columns['hospo_service'] = 'Dining';
		return $columns;
	}

	public static function order_column_content( $column, $order_id ) {
		if ( 'hospo_service' !== $column ) {
			return;
		}
		$order = wc_get_order( $order_id );
		if ( ! $order ) {
			return;
		}
		$date = $order->get_meta( '_hospo_service_date' );
		$time = $order->get_meta( '_hospo_service_time' );
		$book = $order->get_meta( '_hospo_book_table' );
		if ( ! $date && ! $time ) {
			echo '—';
			return;
		}
		echo esc_html( implode( ' ', array_filter( array( $date, $time ) ) ) );
		if ( in_array( strtolower( (string) $book ), array( '1', 'yes', 'true', 'on' ), true ) ) {
			echo ' <span style="color:#7a9;">booked table</span>';
		}
	}

	// ── Config cache (shared with the widget) ────────────────────────────

	private static function config() {
		$key   = 'hospo_ops_config_' . md5( hospo_ops_app_url() . '|' . hospo_ops_api_key() );
		$cached = get_transient( $key );
		if ( false !== $cached ) {
			return $cached;
		}
		$config = Hospo_Ops_API::get_config();
		if ( ! is_wp_error( $config ) ) {
			set_transient( $key, $config, 5 * MINUTE_IN_SECONDS );
		}
		return $config;
	}
}

Hospo_Ops_Checkout::init();
