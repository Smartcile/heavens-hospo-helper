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

		// Admin: a column on the orders list.
		add_filter( 'manage_edit-shop_order_columns', array( __CLASS__, 'order_column' ) );
		add_action( 'manage_shop_order_posts_custom_column', array( __CLASS__, 'order_column_content' ), 10, 2 );
	}

	// ── Checkout fields ──────────────────────────────────────────────────

	public static function render_fields( $checkout ) {
		$config = self::config();
		if ( is_wp_error( $config ) || empty( $config['services'] ) ) {
			return; // Not configured, or no active services — nothing to show.
		}

		$party_options = '';
		for ( $i = 1; $i <= 30; $i++ ) {
			$party_options .= sprintf( '<option value="%d">%d %s</option>', $i, $i, 1 === $i ? 'guest' : 'guests' );
		}

		$service_options = '';
		foreach ( $config['services'] as $service ) {
			$service_options .= sprintf(
				'<option value="%s">%s%s</option>',
				esc_attr( $service['id'] ),
				esc_html( $service['name'] ),
				! empty( $service['wooCategoryName'] ) ? ' — ' . esc_html( $service['wooCategoryName'] ) : ''
			);
		}
		?>
		<div class="hospo-ops-checkout" data-hospo-checkout>
			<h3>Dining details</h3>

			<div class="hospo-ops-row">
				<div class="hospo-ops-field">
					<label for="hospo_order_service">Service</label>
					<select id="hospo_order_service" data-hospo-service>
						<option value="">Choose a service…</option>
						<?php echo $service_options; // phpcs:ignore ?>
					</select>
				</div>
				<div class="hospo-ops-field">
					<label for="hospo_order_date">Date</label>
					<input type="date" id="hospo_order_date" data-hospo-date min="<?php echo esc_attr( gmdate( 'Y-m-d', time() + get_option( 'gmt_offset' ) * HOUR_IN_SECONDS ) ); ?>" />
				</div>
				<div class="hospo-ops-field">
					<label for="hospo_order_party">Party size</label>
					<select id="hospo_order_party" data-hospo-party><?php echo $party_options; // phpcs:ignore ?></select>
				</div>
			</div>

			<div class="hospo-ops-slots" data-hospo-slots></div>

			<p class="hospo-ops-message" data-hospo-message hidden></p>

			<input type="hidden" name="_hospo_service_id" value="" />
			<input type="hidden" name="_hospo_service_date" value="" />
			<input type="hidden" name="_hospo_service_time" value="" />
			<input type="hidden" name="_hospo_party_size" value="" />
			<input type="hidden" name="_hospo_book_table" value="" />
		</div>
		<?php
	}

	public static function validate_fields() {
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
