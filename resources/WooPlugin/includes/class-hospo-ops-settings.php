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
								Generated in the app at <strong>Services &rarr; API KEYS</strong> for the venue this store belongs to.
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
