<?php
/**
 * WooCommerce Blocks checkout support.
 *
 * The Blocks checkout has no `form.checkout` and the classic hooks never
 * fire, so dining details are registered through the official checkout
 * fields API: the Store API renders them, validates them, and saves them to
 * the order. A small script keeps the service/date/time options in sync
 * with the app's live schedule.
 */
class Hospo_Ops_Blocks {

	public static function init() {
		add_action( 'woocommerce_init', array( __CLASS__, 'register_fields' ) );
		// Copy the Store API-saved fields into the `_hospo_*` meta the app
		// reads. Runs after WooCommerce's own field-saving hook.
		add_action( 'woocommerce_store_api_checkout_update_order_from_request', array( __CLASS__, 'persist_from_request' ), 20, 2 );
	}

	/**
	 * Register the dining fields on the Blocks checkout when the setting is on.
	 */
	public static function register_fields() {
		if ( empty( hospo_ops_settings()['show_checkout'] ) ) {
			return; // Classic shortcode path (module or auto section) only.
		}

		add_action(
			'woocommerce_blocks_loaded',
			function () {
				if ( ! class_exists( 'Automattic\WooCommerce\Blocks\Package' ) ||
					! class_exists( 'Automattic\WooCommerce\Blocks\Domain\Services\CheckoutFields' ) ) {
					return;
				}
				$fields = Automattic\WooCommerce\Blocks\Package::container()
					->get( Automattic\WooCommerce\Blocks\Domain\Services\CheckoutFields::class );

				$services = self::service_options();

				$fields->register_checkout_field(
					array(
						'id'       => 'hospo-ops/service_id',
						'label'    => 'Service id',
						'location' => 'other',
						'type'     => 'text',
						'required' => false,
						'attributes' => array( 'class' => 'hospo-ops-hidden-field' ),
					)
				);
				$fields->register_checkout_field(
					array(
						'id'       => 'hospo-ops/service',
						'label'    => __( 'Service', 'hospo-ops' ),
						'location' => 'other',
						'type'     => 'select',
						'required' => true,
						'options'  => $services,
					)
				);
				$fields->register_checkout_field(
					array(
						'id'       => 'hospo-ops/date',
						'label'    => __( 'Date', 'hospo-ops' ),
						'location' => 'other',
						'type'     => 'select',
						'required' => true,
						'options'  => array( '' => __( 'Choose a date…', 'hospo-ops' ) ),
					)
				);
				$fields->register_checkout_field(
					array(
						'id'       => 'hospo-ops/time',
						'label'    => __( 'Time', 'hospo-ops' ),
						'location' => 'other',
						'type'     => 'select',
						'required' => true,
						'options'  => array( '' => __( 'Choose a time…', 'hospo-ops' ) ),
					)
				);
				$fields->register_checkout_field(
					array(
						'id'       => 'hospo-ops/party',
						'label'    => __( 'Party size', 'hospo-ops' ),
						'location' => 'other',
						'type'     => 'text',
						'required' => true,
						'attributes' => array(
							'inputmode' => 'numeric',
							'pattern'   => '[0-9]*',
							'min'       => '1',
							'max'       => '30',
						),
					)
				);
				$fields->register_checkout_field(
					array(
						'id'       => 'hospo-ops/book',
						'label'    => __( 'Book a table too', 'hospo-ops' ),
						'location' => 'other',
						'type'     => 'checkbox',
						'required' => false,
					)
				);
			}
		);
	}

	/**
	 * The service select options — static at registration; the script
	 * refreshes them from the live config anyway.
	 */
	private static function service_options() {
		$config = Hospo_Ops_Booking_Widget::cached_config();
		$out    = array( '' => __( 'Choose a service…', 'hospo-ops' ) );
		if ( is_wp_error( $config ) || empty( $config['services'] ) ) {
			return $out;
		}
		foreach ( $config['services'] as $service ) {
			$out[ $service['id'] ] = $service['name'];
		}
		return $out;
	}

	/**
	 * Blocks checkout: copy the Store API-saved fields into `_hospo_*` meta.
	 */
	public static function persist_from_request( $order, $request ) {
		if ( ! $order || ! method_exists( $order, 'update_meta_data' ) ) {
			return;
		}

		$values = array();
		$fields = $request['additional_fields'] ?? array();
		if ( is_array( $fields ) && ! empty( $fields ) ) {
			foreach ( $fields as $field_id => $value ) {
				if ( is_string( $field_id ) && false !== strpos( $field_id, '/' ) ) {
					$values[ $field_id ] = is_scalar( $value ) ? (string) $value : '';
				}
			}
		}

		// Fallback: WooCommerce stores the fields itself as `_wc_other/…`.
		if ( empty( $values ) ) {
			foreach ( $order->get_meta_data() as $meta ) {
				$key = (string) $meta->key;
				if ( 0 === strpos( $key, '_wc_other/' ) ) {
					$name = substr( $key, strlen( '_wc_other/' ) );
					$values[ $name ] = (string) $meta->value;
				}
			}
		}

		if ( empty( $values ) ) {
			return;
		}

		$map = array(
			'hospo-ops/service_id' => '_hospo_service_id',
			'hospo-ops/service'    => '_hospo_service_name',
			'hospo-ops/date'       => '_hospo_service_date',
			'hospo-ops/time'       => '_hospo_service_time',
			'hospo-ops/party'      => '_hospo_party_size',
			'hospo-ops/book'       => '_hospo_book_table',
		);
		foreach ( $map as $field_id => $meta_key ) {
			// The meta fallback key may be the full id or the name after the slash.
			$value = $values[ $field_id ] ?? $values[ substr( $field_id, strpos( $field_id, '/' ) + 1 ) ] ?? null;
			if ( null === $value || '' === $value ) {
				continue;
			}
			if ( 'hospo-ops/book' === $field_id ) {
				$value = in_array( strtolower( $value ), array( '1', 'true', 'yes', 'on' ), true ) ? '1' : '';
				if ( '' === $value ) {
					continue;
				}
			}
			$order->update_meta_data( $meta_key, $value );
		}
		$order->save();
	}
}
