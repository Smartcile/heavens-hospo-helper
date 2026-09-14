<?php
/**
 * WooCommerce setup for the CONNECT flow.
 *
 * The plugin runs inside WordPress, so it can do the two things the
 * WooCommerce REST API cannot do for itself: mint a REST API key pair and
 * register webhooks. CONNECT mints a Read/Write key, hands it to the app
 * (which answers with a fresh webhook secret and the delivery URL), then
 * writes the four HOSPO OPS webhooks. RE-CONNECT rotates everything and
 * DISCONNECT revokes the key and removes the webhooks.
 */
class Hospo_Ops_Woo_Setup {

	const OPTION = 'hospo_ops_pairing';

	/**
	 * topic => webhook name. The names are the ones the manual SOP has always
	 * prescribed, so a store set up by hand is adopted rather than duplicated.
	 */
	public static function topics() {
		return array(
			'order.updated'   => 'HOSPO OPS Order Sync',
			'product.created' => 'HOSPO OPS Product Created',
			'product.updated' => 'HOSPO OPS Product Updated',
			'product.deleted' => 'HOSPO OPS Product Deleted',
		);
	}

	public static function pairing() {
		$saved = get_option( self::OPTION, array() );
		return is_array( $saved ) ? $saved : array();
	}

	private static function save_pairing( $pairing ) {
		update_option( self::OPTION, $pairing );
	}

	/**
	 * Mint a Read/Write REST API key. This mirrors what WooCommerce's own
	 * admin screen does — WC_API_Keys was removed in WC 11, so there is no
	 * public helper to call.
	 *
	 * @return array|WP_Error
	 */
	public static function create_api_key() {
		global $wpdb;

		$consumer_key    = 'ck_' . wc_rand_hash();
		$consumer_secret = 'cs_' . wc_rand_hash();

		$inserted = $wpdb->insert(
			$wpdb->prefix . 'woocommerce_api_keys',
			array(
				'user_id'         => get_current_user_id(),
				'description'     => 'HOSPO OPS (auto)',
				'permissions'     => 'read_write',
				'consumer_key'    => wc_api_hash( $consumer_key ),
				'consumer_secret' => $consumer_secret,
				'truncated_key'   => substr( $consumer_key, -7 ),
			),
			array( '%d', '%s', '%s', '%s', '%s', '%s' )
		);

		if ( ! $inserted ) {
			return new WP_Error( 'hospo_ops_key', 'Could not store the WooCommerce API key.' );
		}

		return array(
			'key_id'          => (int) $wpdb->insert_id,
			'consumer_key'    => $consumer_key,
			'consumer_secret' => $consumer_secret,
		);
	}

	public static function revoke_api_key( $key_id ) {
		global $wpdb;
		if ( empty( $key_id ) ) {
			return;
		}
		$wpdb->delete(
			$wpdb->prefix . 'woocommerce_api_keys',
			array( 'key_id' => (int) $key_id ),
			array( '%d' )
		);
	}

	/**
	 * Create or update the four HOSPO OPS webhooks, then delete any stale
	 * HOSPO OPS webhooks (old topics, duplicates).
	 *
	 * @return array topic => webhook id
	 */
	public static function apply_webhooks( $secret, $delivery_url ) {
		$topics  = self::topics();
		$pairing = self::pairing();
		$known   = isset( $pairing['webhook_ids'] ) && is_array( $pairing['webhook_ids'] )
			? $pairing['webhook_ids']
			: array();

		$existing = array();
		foreach ( self::all_hospo_webhooks() as $webhook ) {
			$existing[ $webhook->get_id() ] = $webhook;
		}

		$webhook_ids = array();

		foreach ( $topics as $topic => $name ) {
			$webhook = null;

			if ( ! empty( $known[ $topic ] ) && isset( $existing[ (int) $known[ $topic ] ] ) ) {
				$webhook = $existing[ (int) $known[ $topic ] ];
			} else {
				foreach ( $existing as $candidate ) {
					if ( $candidate->get_topic() === $topic ) {
						$webhook = $candidate;
						break;
					}
				}
			}

			if ( ! $webhook ) {
				$webhook = new WC_Webhook();
			}

			$webhook->set_name( $name );
			$webhook->set_topic( $topic );
			$webhook->set_delivery_url( $delivery_url );
			$webhook->set_secret( $secret );
			$webhook->set_api_version( 3 );
			$webhook->set_user_id( get_current_user_id() );
			$webhook->set_status( 'active' );
			$webhook->save();

			$webhook_ids[ $topic ] = $webhook->get_id();
			unset( $existing[ $webhook->get_id() ] );
		}

		foreach ( $existing as $webhook ) {
			$webhook->delete( true );
		}

		return $webhook_ids;
	}

	/**
	 * Full connect / re-connect: mint a key, register it with the app, write
	 * the webhooks, then revoke the previous key.
	 *
	 * @return array|WP_Error { pairing, ping }
	 */
	public static function connect() {
		if ( ! class_exists( 'WooCommerce' ) || ! function_exists( 'wc_rand_hash' ) ) {
			return new WP_Error( 'hospo_ops_woo', 'WooCommerce is not active on this site.' );
		}

		$old = self::pairing();

		$key = self::create_api_key();
		if ( is_wp_error( $key ) ) {
			return $key;
		}

		$response = Hospo_Ops_API::connect_woocommerce(
			array(
				'storeUrl'       => home_url( '/' ),
				'consumerKey'    => $key['consumer_key'],
				'consumerSecret' => $key['consumer_secret'],
				'pluginVersion'  => HOSPO_OPS_VERSION,
			)
		);

		if ( is_wp_error( $response ) ) {
			// The app never saw this key — don't leave it lying around.
			self::revoke_api_key( $key['key_id'] );
			return $response;
		}

		$secret   = isset( $response['webhookSecret'] ) ? (string) $response['webhookSecret'] : '';
		$delivery = isset( $response['webhookUrl'] ) ? (string) $response['webhookUrl'] : '';
		if ( '' === $secret || '' === $delivery ) {
			self::revoke_api_key( $key['key_id'] );
			return new WP_Error( 'hospo_ops_pair', 'The app did not return a webhook secret.' );
		}

		$webhook_ids = self::apply_webhooks( $secret, $delivery );

		// The app has switched to the new key — the old one is dead weight.
		if ( ! empty( $old['key_id'] ) && (int) $old['key_id'] !== (int) $key['key_id'] ) {
			self::revoke_api_key( $old['key_id'] );
		}

		$pairing = array(
			'key_id'         => $key['key_id'],
			'consumer_key'   => $key['consumer_key'],
			'webhook_secret' => $secret,
			'delivery_url'   => $delivery,
			'webhook_ids'    => $webhook_ids,
			'venue'          => isset( $response['venue']['name'] ) ? (string) $response['venue']['name'] : '',
			'store_url'      => isset( $response['storeUrl'] ) ? (string) $response['storeUrl'] : home_url( '/' ),
			'paired_at'      => current_time( 'mysql' ),
		);
		self::save_pairing( $pairing );

		return array(
			'pairing' => $pairing,
			'ping'    => self::ping( $webhook_ids ),
		);
	}

	/**
	 * Ping one webhook so the admin gets an immediate delivery verdict.
	 *
	 * @return array|null { topic, ok, error }
	 */
	private static function ping( $webhook_ids ) {
		foreach ( $webhook_ids as $topic => $id ) {
			$webhook = wc_get_webhook( $id );
			if ( ! $webhook ) {
				continue;
			}
			$result = $webhook->deliver_ping();
			return array(
				'topic' => $topic,
				'ok'    => ! is_wp_error( $result ),
				'error' => is_wp_error( $result ) ? $result->get_error_message() : '',
			);
		}
		return null;
	}

	/**
	 * Revoke the API key and remove every HOSPO OPS webhook.
	 *
	 * @return string The consumer key that was disconnected (for the app call).
	 */
	public static function disconnect() {
		$pairing = self::pairing();

		foreach ( self::all_hospo_webhooks() as $webhook ) {
			$webhook->delete( true );
		}

		if ( ! empty( $pairing['key_id'] ) ) {
			self::revoke_api_key( $pairing['key_id'] );
		}

		delete_option( self::OPTION );

		return isset( $pairing['consumer_key'] ) ? (string) $pairing['consumer_key'] : '';
	}

	/**
	 * Pairing + live webhook state for the settings page.
	 *
	 * @return array|null
	 */
	public static function status() {
		if ( ! class_exists( 'WooCommerce' ) ) {
			return null;
		}

		$pairing = self::pairing();
		if ( empty( $pairing['consumer_key'] ) ) {
			return null;
		}

		$webhooks = array();
		foreach ( self::all_hospo_webhooks() as $webhook ) {
			$webhooks[ $webhook->get_topic() ] = array(
				'id'            => $webhook->get_id(),
				'name'          => $webhook->get_name(),
				'status'        => $webhook->get_status(),
				'delivery_url'  => $webhook->get_delivery_url(),
				'failure_count' => $webhook->get_failure_count(),
			);
		}

		return array(
			'pairing'  => $pairing,
			'webhooks' => $webhooks,
		);
	}

	/** Every webhook whose name starts with "HOSPO OPS". */
	private static function all_hospo_webhooks() {
		if ( ! class_exists( 'WC_Data_Store' ) ) {
			return array();
		}

		$store = WC_Data_Store::load( 'webhook' );
		// search_webhooks() returns webhook IDs, not objects.
		$ids = $store->search_webhooks( array( 'limit' => -1, 'search' => 'HOSPO OPS' ) );
		if ( ! is_array( $ids ) ) {
			return array();
		}

		$webhooks = array();
		foreach ( $ids as $id ) {
			$webhook = wc_get_webhook( $id );
			if ( $webhook ) {
				$webhooks[] = $webhook;
			}
		}
		return $webhooks;
	}
}
