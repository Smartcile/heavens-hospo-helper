<?php
/**
 * Settings page — the plugin's only configuration.
 *
 * Two fields: app URL + API key. TEST CONNECTION fetches /api/public/config
 * and shows the venue it resolves to. No schedule lives here — the app owns
 * everything and the plugin just renders it.
 */
class Hospo_Ops_Settings {

	public static function register_menu() {
		add_menu_page(
			'HOSPO OPS',
			'HOSPO OPS',
			'manage_options',
			'hospo-ops',
			array( __CLASS__, 'render_page' ),
			'dashicons-store',
			58
		);
	}

	public static function render_page() {
		$settings = hospo_ops_settings();
		$tested   = get_transient( 'hospo_ops_test_result' );
		?>
		<div class="wrap">
			<h1>HOSPO OPS</h1>
			<p>Connects this WooCommerce store to your HOSPO OPS venue: customers pick a service, date, time slot and party size at checkout, and dated orders land on the right day with the service attached.</p>

			<?php if ( $tested ) : ?>
				<div class="notice <?php echo esc_attr( $tested['ok'] ? 'notice-success' : 'notice-error' ); ?> is-dismissible">
					<p><?php echo esc_html( $tested['message'] ); ?></p>
				</div>
			<?php endif; ?>

			<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" style="max-width: 640px;">
				<input type="hidden" name="action" value="hospo_ops_save_settings" />
				<?php wp_nonce_field( 'hospo_ops_save' ); ?>

				<table class="form-table" role="presentation">
					<tr>
						<th scope="row"><label for="hospo_app_url">HOSPO OPS APP URL</label></th>
						<td>
							<input
								type="url"
								id="hospo_app_url"
								name="app_url"
								value="<?php echo esc_attr( $settings['app_url'] ); ?>"
								class="regular-text"
								placeholder="https://hospo.example.com"
								required
							/>
							<p class="description">The address of your HOSPO OPS app (no trailing slash needed).</p>
						</td>
					</tr>
					<tr>
						<th scope="row"><label for="hospo_api_key">API KEY</label></th>
						<td>
							<input
								type="password"
								id="hospo_api_key"
								name="api_key"
								value="<?php echo esc_attr( $settings['api_key'] ); ?>"
								class="regular-text"
								placeholder="ho_..."
								required
							/>
							<p class="description">
								Generated in the app at <strong>Settings &rarr; WOOCOMMERCE &rarr; EXTERNAL API</strong> for the venue this store belongs to.
							</p>
						</td>
					</tr>
					<tr>
						<th scope="row">Checkout dining details</th>
						<td>
							<label>
								<input type="checkbox" name="show_checkout" value="1" <?php checked( ! empty( $settings['show_checkout'] ) ); ?> />
								Show the dining details (service / date / time) automatically on the checkout page.
							</label>
							<p class="description">
								Turn this off to place the <strong>HOSPO OPS Checkout</strong> Divi module yourself instead.
							</p>
						</td>
					</tr>
				</table>

				<?php submit_button( 'SAVE' ); ?>
			</form>

			<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" style="max-width: 640px;">
				<input type="hidden" name="action" value="hospo_ops_test_connection" />
				<?php wp_nonce_field( 'hospo_ops_test' ); ?>
				<?php submit_button( 'TEST CONNECTION', 'secondary' ); ?>
			</form>

			<?php self::render_woocommerce_connection(); ?>

			<?php if ( $tested && $tested['ok'] && ! empty( $tested['config'] ) ) : ?>
				<h2>What the app is serving</h2>
				<p>These are the services currently active for this venue. They appear at checkout and in the booking widget automatically.</p>
				<table class="widefat striped" style="max-width: 640px;">
					<thead>
						<tr>
							<th>Service</th>
							<th>Menu</th>
							<th>Times</th>
							<th>Booking</th>
						</tr>
					</thead>
					<tbody>
						<?php foreach ( $tested['config']['services'] as $service ) : ?>
							<tr>
								<td><?php echo esc_html( $service['name'] ); ?></td>
								<td><?php echo esc_html( $service['wooCategoryName'] ?: '—' ); ?></td>
								<td><?php echo esc_html( self::describe_times( $service ) ); ?></td>
								<td><?php echo $service['requiresBooking'] ? 'Required' : 'Optional'; ?></td>
							</tr>
						<?php endforeach; ?>
						<?php if ( empty( $tested['config']['services'] ) ) : ?>
							<tr><td colspan="4">No active services yet — create one in the app.</td></tr>
						<?php endif; ?>
					</tbody>
				</table>
			<?php endif; ?>
		</div>
		<?php
	}

	/**
	 * WooCommerce CONNECT / DISCONNECT. CONNECT mints a REST API key, hands it
	 * to the app and writes the webhooks — replacing the manual SOP steps.
	 */
	private static function render_woocommerce_connection() {
		if ( ! class_exists( 'WooCommerce' ) ) {
			?>
			<h2>WooCommerce connection</h2>
			<div class="notice notice-error inline"><p>WooCommerce is not active on this site — activate it to pair the store.</p></div>
			<?php
			return;
		}

		$status = Hospo_Ops_Woo_Setup::status();
		?>
		<h2>WooCommerce connection</h2>
		<p>
			Connecting creates a <strong>Read/Write</strong> WooCommerce REST API key for HOSPO OPS,
			sends it to the app, and registers the four order/product webhooks — no copy/pasting
			between the two systems. Re-connecting rotates the key and the webhook secret.
		</p>

		<?php if ( $status ) : ?>
			<table class="widefat striped" style="max-width: 720px;">
				<tbody>
					<tr><td><strong>Venue</strong></td><td><?php echo esc_html( $status['pairing']['venue'] ?: '—' ); ?></td></tr>
					<tr><td><strong>Store URL</strong></td><td><?php echo esc_html( $status['pairing']['store_url'] ); ?></td></tr>
					<tr><td><strong>Consumer key</strong></td><td><?php echo esc_html( self::mask( $status['pairing']['consumer_key'] ) ); ?></td></tr>
					<tr><td><strong>Webhook secret</strong></td><td><?php echo esc_html( self::mask( $status['pairing']['webhook_secret'] ) ); ?></td></tr>
					<tr><td><strong>Paired</strong></td><td><?php echo esc_html( $status['pairing']['paired_at'] ); ?></td></tr>
				</tbody>
			</table>

			<h3>Webhooks</h3>
			<table class="widefat striped" style="max-width: 720px;">
				<thead>
					<tr><th>Name</th><th>Topic</th><th>Status</th><th>Failures</th></tr>
				</thead>
				<tbody>
					<?php foreach ( $status['webhooks'] as $topic => $webhook ) : ?>
						<tr>
							<td><?php echo esc_html( $webhook['name'] ); ?></td>
							<td><code><?php echo esc_html( $topic ); ?></code></td>
							<td><?php echo esc_html( ucfirst( $webhook['status'] ) ); ?></td>
							<td><?php echo (int) $webhook['failure_count']; ?></td>
						</tr>
					<?php endforeach; ?>
					<?php if ( empty( $status['webhooks'] ) ) : ?>
						<tr><td colspan="4">No HOSPO OPS webhooks found — re-connect to create them.</td></tr>
					<?php endif; ?>
				</tbody>
			</table>

			<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" style="display:inline-block; margin-right:8px;">
				<input type="hidden" name="action" value="hospo_ops_connect" />
				<?php wp_nonce_field( 'hospo_ops_connect' ); ?>
				<?php submit_button( 'RE-CONNECT (ROTATE CREDENTIALS)', 'secondary', 'submit', false ); ?>
			</form>
			<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" style="display:inline-block;">
				<input type="hidden" name="action" value="hospo_ops_disconnect" />
				<?php wp_nonce_field( 'hospo_ops_disconnect' ); ?>
				<?php submit_button( 'DISCONNECT', 'delete', 'submit', false, array( 'onclick' => "return confirm('Disconnect this store? The API key is revoked and the HOSPO OPS webhooks are removed.');" ) ); ?>
			</form>
		<?php else : ?>
			<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
				<input type="hidden" name="action" value="hospo_ops_connect" />
				<?php wp_nonce_field( 'hospo_ops_connect' ); ?>
				<?php submit_button( 'CONNECT TO HOSPO OPS' ); ?>
			</form>
		<?php endif; ?>
		<?php
	}

	private static function mask( $value ) {
		$value = (string) $value;
		if ( strlen( $value ) <= 4 ) {
			return $value;
		}
		return '••••••••' . substr( $value, -4 );
	}

	public static function handle_save_settings() {
		if ( ! current_user_can( 'manage_options' ) || ! check_admin_referer( 'hospo_ops_save' ) ) {
			wp_die( 'Not allowed.' );
		}

		update_option(
			'hospo_ops_settings',
			array(
				'app_url'       => esc_url_raw( isset( $_POST['app_url'] ) ? wp_unslash( $_POST['app_url'] ) : '' ),
				'api_key'       => sanitize_text_field( isset( $_POST['api_key'] ) ? wp_unslash( $_POST['api_key'] ) : '' ),
				'show_checkout' => empty( $_POST['show_checkout'] ) ? 0 : 1,
			)
		);

		wp_safe_redirect( admin_url( 'admin.php?page=hospo-ops' ) );
		exit;
	}

	public static function handle_test_connection() {
		if ( ! current_user_can( 'manage_options' ) || ! check_admin_referer( 'hospo_ops_test' ) ) {
			wp_die( 'Not allowed.' );
		}

		$config = Hospo_Ops_API::get_config();

		if ( is_wp_error( $config ) ) {
			set_transient( 'hospo_ops_test_result', array( 'ok' => false, 'message' => 'Connection failed: ' . $config->get_error_message() ), 30 );
		} else {
			$venue  = isset( $config['venue']['name'] ) ? $config['venue']['name'] : 'unknown venue';
			$count  = count( isset( $config['services'] ) ? $config['services'] : array() );
			set_transient(
				'hospo_ops_test_result',
				array(
					'ok'      => true,
					'message' => sprintf( 'Connected to %s — %d active service(s) found.', esc_html( $venue ), $count ),
					'config'  => $config,
				),
				300
			);
		}

		wp_safe_redirect( admin_url( 'admin.php?page=hospo-ops' ) );
		exit;
	}

	/**
	 * CONNECT / RE-CONNECT: mint credentials, register them with the app and
	 * write the webhooks. Re-running rotates everything.
	 */
	public static function handle_connect() {
		if ( ! current_user_can( 'manage_options' ) || ! check_admin_referer( 'hospo_ops_connect' ) ) {
			wp_die( 'Not allowed.' );
		}

		if ( '' === hospo_ops_app_url() || '' === hospo_ops_api_key() ) {
			set_transient(
				'hospo_ops_test_result',
				array( 'ok' => false, 'message' => 'Save the app URL and API key first, then connect.' ),
				30
			);
			wp_safe_redirect( admin_url( 'admin.php?page=hospo-ops' ) );
			exit;
		}

		$result = Hospo_Ops_Woo_Setup::connect();

		if ( is_wp_error( $result ) ) {
			set_transient(
				'hospo_ops_test_result',
				array( 'ok' => false, 'message' => 'Connect failed: ' . $result->get_error_message() ),
				60
			);
		} else {
			$message = sprintf(
				'Connected to %s — API key and %d webhooks configured.',
				$result['pairing']['venue'] ? $result['pairing']['venue'] : 'your venue',
				count( $result['pairing']['webhook_ids'] )
			);
			if ( ! empty( $result['ping'] ) ) {
				$message .= $result['ping']['ok']
					? ' Test delivery succeeded.'
					: ' Test delivery failed: ' . $result['ping']['error'];
			}
			set_transient( 'hospo_ops_test_result', array( 'ok' => true, 'message' => $message ), 60 );
		}

		wp_safe_redirect( admin_url( 'admin.php?page=hospo-ops' ) );
		exit;
	}

	/**
	 * DISCONNECT: tell the app (best-effort), then revoke the key and delete
	 * the webhooks locally.
	 */
	public static function handle_disconnect() {
		if ( ! current_user_can( 'manage_options' ) || ! check_admin_referer( 'hospo_ops_disconnect' ) ) {
			wp_die( 'Not allowed.' );
		}

		$pairing      = Hospo_Ops_Woo_Setup::pairing();
		$consumer_key = isset( $pairing['consumer_key'] ) ? (string) $pairing['consumer_key'] : '';

		// Best-effort app-side cleanup before the local credentials are gone.
		if ( '' !== $consumer_key && '' !== hospo_ops_app_url() ) {
			Hospo_Ops_API::disconnect_woocommerce( $consumer_key );
		}

		Hospo_Ops_Woo_Setup::disconnect();

		set_transient(
			'hospo_ops_test_result',
			array( 'ok' => true, 'message' => 'Disconnected — API key revoked and HOSPO OPS webhooks removed.' ),
			60
		);
		wp_safe_redirect( admin_url( 'admin.php?page=hospo-ops' ) );
		exit;
	}

	/**
	 * "FRI 17:00-18:00, FRI 18:00-19:00" style summary for the config table.
	 */
	private static function describe_times( $service ) {
		$days = array( 'SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT' );
		$out  = array();
		foreach ( $service['slots'] as $slot ) {
			$out[] = $days[ (int) $slot['dayOfWeek'] ] . ' ' . $slot['startTime'] . '-' . $slot['endTime'];
		}
		return empty( $out ) ? '—' : implode( ', ', array_slice( $out, 0, 4 ) );
	}
}
