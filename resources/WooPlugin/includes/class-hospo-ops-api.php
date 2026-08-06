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
