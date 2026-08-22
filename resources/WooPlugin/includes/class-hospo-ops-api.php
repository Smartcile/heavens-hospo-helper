<?php
/**
 * Thin client for the HOSPO OPS public API.
 *
 * Every call sends the API key as a Bearer token and returns the decoded
 * response, or a WP_Error on transport failure.
 */
class Hospo_Ops_API {

	/**
	 * GET /api/public/config — venue + active services with slots/exceptions.
	 *
	 * @return array|WP_Error
	 */
	public static function get_config() {
		$url  = hospo_ops_app_url() . '/api/public/config';
		$resp = wp_remote_get( $url, array( 'headers' => self::headers(), 'timeout' => 15 ) );

		return self::decode( $resp, __FUNCTION__ );
	}

	/**
	 * GET /api/public/availability?date=YYYY-MM-DD&party=N
	 *
	 * @param string $date YYYY-MM-DD venue-local date.
	 * @param int    $party
	 * @return array|WP_Error
	 */
	public static function get_availability( $date, $party ) {
		$url  = add_query_arg(
			array( 'date' => $date, 'party' => max( 1, (int) $party ) ),
			hospo_ops_app_url() . '/api/public/availability'
		);
		$resp = wp_remote_get( $url, array( 'headers' => self::headers(), 'timeout' => 15 ) );

		return self::decode( $resp, __FUNCTION__ );
	}

	/**
	 * POST /api/public/bookings — booking-only reservations (no payment).
	 *
	 * @param array $payload serviceId, date, time, partySize, name, phone, email, notes.
	 * @return array|WP_Error
	 */
	public static function create_booking( $payload ) {
		$url  = hospo_ops_app_url() . '/api/public/bookings';
		$resp = wp_remote_post(
			$url,
			array(
				'headers' => array_merge( self::headers(), array( 'Content-Type' => 'application/json' ) ),
				'timeout' => 15,
				'body'    => wp_json_encode( $payload ),
			)
		);

		return self::decode( $resp, __FUNCTION__ );
	}

	/**
	 * GET /api/public/orders/{id}/gift-card-pdf — the venue's gift card
	 * PDF(s) for a WooCommerce order, saved to a local file.
	 *
	 * 404 means the order has no gift cards (or the app hasn't synced it
	 * yet) — the caller retries briefly, then sends the email un-attached.
	 *
	 * @param int|string $order_id
	 * @return string|WP_Error Local file path on success.
	 */
	public static function get_order_gift_card_pdf( $order_id ) {
		$url  = hospo_ops_app_url() . '/api/public/orders/' . rawurlencode( (string) $order_id ) . '/gift-card-pdf';
		$resp = wp_remote_get( $url, array( 'headers' => self::headers(), 'timeout' => 25 ) );

		if ( is_wp_error( $resp ) ) {
			return $resp;
		}

		$code = (int) wp_remote_retrieve_response_code( $resp );
		$body = wp_remote_retrieve_body( $resp );

		// Sanity-check the magic bytes so a misrouted app URL can never
		// produce a bogus "attachment".
		if ( $code >= 400 || '' === $body || 0 !== strpos( $body, '%PDF' ) ) {
			return new WP_Error(
				'hospo_ops_http_' . $code,
				sprintf( 'Gift card PDF fetch for order %s: HTTP %d', $order_id, $code )
			);
		}

		$uploads = wp_upload_dir();
		$dir     = trailingslashit( $uploads['basedir'] ) . 'hospo-ops/gift-cards';
		if ( ! wp_mkdir_p( $dir ) ) {
			return new WP_Error( 'hospo_ops_mkdir', 'Could not create ' . $dir );
		}

		$file = $dir . '/order-' . $order_id . '.pdf';
		file_put_contents( $file, $body ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
		return $file;
	}

	/**
	 * Auth headers for every request.
	 */
	private static function headers() {
		return array(
			'Authorization' => 'Bearer ' . hospo_ops_api_key(),
		);
	}

	/**
	 * Decode a wp_remote_* response into data or a WP_Error.
	 */
	private static function decode( $resp, $caller ) {
		if ( is_wp_error( $resp ) ) {
			return $resp;
		}

		$code = (int) wp_remote_retrieve_response_code( $resp );
		$body = wp_remote_retrieve_body( $resp );
		$data = json_decode( $body, true );

		if ( $code >= 400 || ! is_array( $data ) ) {
			$message = is_array( $data ) && isset( $data['error'] )
				? $data['error']
				: sprintf( 'HTTP %d from %s', $code, $caller );
			return new WP_Error( 'hospo_ops_http_' . $code, $message );
		}

		return $data;
	}
}
