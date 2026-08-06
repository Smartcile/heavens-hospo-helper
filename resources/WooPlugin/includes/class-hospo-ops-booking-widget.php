<?php
/**
 * Booking-only widget: customers book a table for a service date/time with no
 * food order and no payment. Rendered by the [hospo_booking] shortcode, the
 * "HOSPO OPS Booking" sidebar widget, and the Gutenberg block — one renderer.
 */
class Hospo_Ops_Booking_Widget {

	const NONCE_ACTION = 'hospo_ops_public';

	public static function init() {
		add_shortcode( 'hospo_booking', array( __CLASS__, 'render_shortcode' ) );
		add_action( 'widgets_init', array( __CLASS__, 'register_widget' ) );
		add_action( 'init', array( __CLASS__, 'register_block' ) );
		add_action( 'wp_enqueue_scripts', array( __CLASS__, 'enqueue_assets' ) );

		// Public AJAX handlers (customers are not logged in).
		add_action( 'wp_ajax_hospo_ops_config', array( __CLASS__, 'ajax_config' ) );
		add_action( 'wp_ajax_nopriv_hospo_ops_config', array( __CLASS__, 'ajax_config' ) );
		add_action( 'wp_ajax_hospo_ops_availability', array( __CLASS__, 'ajax_availability' ) );
		add_action( 'wp_ajax_nopriv_hospo_ops_availability', array( __CLASS__, 'ajax_availability' ) );
		add_action( 'wp_ajax_hospo_ops_book', array( __CLASS__, 'ajax_book' ) );
		add_action( 'wp_ajax_nopriv_hospo_ops_book', array( __CLASS__, 'ajax_book' ) );
	}

	// ── Shortcode ────────────────────────────────────────────────────────

	public static function render_shortcode( $atts ) {
		$atts = shortcode_atts(
			array(
				'service' => '', // optional service UUID to preselect
			),
			$atts,
			'hospo_booking'
		);

		return self::render( $atts['service'] );
	}

	// ── Sidebar widget ───────────────────────────────────────────────────

	public static function register_widget() {
		register_widget( 'Hospo_Ops_Booking_Widget_Widget' );
	}

	// ── Gutenberg block (dynamic, no build step) ─────────────────────────

	public static function register_block() {
		if ( ! function_exists( 'register_block_type' ) ) {
			return;
		}
		wp_register_script(
			'hospo-ops-block',
			HOSPO_OPS_URL . 'assets/js/hospo-ops-block.js',
			array( 'wp-blocks', 'wp-element', 'wp-block-editor' ),
			HOSPO_OPS_VERSION,
			true
		);
		register_block_type(
			'hospo-ops/booking',
			array(
				'render_callback' => array( __CLASS__, 'render_block' ),
				'editor_script'   => 'hospo-ops-block',
				'attributes'      => array(
					'service' => array( 'type' => 'string', 'default' => '' ),
				),
			)
		);
	}

	public static function render_block( $attributes ) {
		$service = isset( $attributes['service'] ) ? $attributes['service'] : '';
		return self::render( $service );
	}

	// ── Assets ───────────────────────────────────────────────────────────

	public static function enqueue_assets() {
		$should_load = function_exists( 'is_checkout' ) && is_checkout();

		if ( ! $should_load && ! is_admin() ) {
			$post_id = get_the_ID();
			if ( $post_id ) {
				$content = (string) get_post_field( 'post_content', $post_id );
				$should_load = has_shortcode( $content, 'hospo_booking' ) || has_block( 'hospo-ops/booking', $post_id );
			}
			$should_load = apply_filters( 'hospo_ops_enqueue_assets', $should_load );
		}

		if ( ! $should_load ) {
			return;
		}

		wp_enqueue_style( 'hospo-ops', HOSPO_OPS_URL . 'assets/css/hospo-ops.css', array(), HOSPO_OPS_VERSION );
		wp_enqueue_script( 'hospo-ops', HOSPO_OPS_URL . 'assets/js/hospo-ops-frontend.js', array(), HOSPO_OPS_VERSION, true );
		wp_localize_script(
			'hospo-ops',
			'HospoOps',
			array(
				'ajaxUrl' => admin_url( 'admin-ajax.php' ),
				'nonce'   => wp_create_nonce( self::NONCE_ACTION ),
			)
		);
	}

	// ── The shared renderer ──────────────────────────────────────────────

	public static function render( $preselected_service = '' ) {
		$config = self::cached_config();
		if ( is_wp_error( $config ) || empty( $config['services'] ) ) {
			return '<div class="hospo-ops-widget"><p class="hospo-ops-note">Bookings are not available right now. Please call us.</p></div>';
		}

		$services = wp_list_pluck( $config['services'], 'id' );
		$selected = in_array( $preselected_service, $services, true ) ? $preselected_service : '';

		// Party sizes 1-30.
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

		// A fresh nonce per render keeps the public form usable.
		ob_start();
		?>
		<div class="hospo-ops-widget" data-hospo-widget>
			<div class="hospo-ops-field">
				<label for="hospo_booking_date">Date</label>
				<input type="date" id="hospo_booking_date" data-hospo-date min="<?php echo esc_attr( gmdate( 'Y-m-d', time() + get_option( 'gmt_offset' ) * HOUR_IN_SECONDS ) ); ?>" required />
			</div>
			<div class="hospo-ops-field">
				<label for="hospo_booking_party">Party size</label>
				<select id="hospo_booking_party" data-hospo-party><?php echo $party_options; // phpcs:ignore ?></select>
			</div>
			<?php if ( count( $config['services'] ) > 1 ) : ?>
				<div class="hospo-ops-field">
					<label for="hospo_booking_service">Service</label>
					<select id="hospo_booking_service" data-hospo-service>
						<option value="">Choose a service…</option>
						<?php echo $service_options; // phpcs:ignore ?>
					</select>
				</div>
			<?php endif; ?>
			<input type="hidden" data-hospo-service-input value="<?php echo esc_attr( $selected ); ?>" />

			<div class="hospo-ops-slots" data-hospo-slots hidden></div>

			<div class="hospo-ops-fields" data-hospo-fields hidden>
				<div class="hospo-ops-field">
					<label for="hospo_booking_name">Name</label>
					<input type="text" id="hospo_booking_name" data-hospo-name required />
				</div>
				<div class="hospo-ops-row">
					<div class="hospo-ops-field">
						<label for="hospo_booking_phone">Phone</label>
						<input type="tel" id="hospo_booking_phone" data-hospo-phone />
					</div>
					<div class="hospo-ops-field">
						<label for="hospo_booking_email">Email</label>
						<input type="email" id="hospo_booking_email" data-hospo-email />
					</div>
				</div>
				<button type="button" class="hospo-ops-submit" data-hospo-submit>Book table</button>
				<p class="hospo-ops-message" data-hospo-message hidden></p>
			</div>
		</div>
		<?php
		return ob_get_clean();
	}

	// ── AJAX ─────────────────────────────────────────────────────────────

	public static function ajax_config() {
		check_ajax_referer( self::NONCE_ACTION, '_wpnonce' );
		$config = self::cached_config();
		if ( is_wp_error( $config ) ) {
			wp_send_json_error( array( 'error' => $config->get_error_message() ), 502 );
		}
		wp_send_json_success( $config );
	}

	public static function ajax_availability() {
		check_ajax_referer( self::NONCE_ACTION, '_wpnonce' );
		$date  = isset( $_GET['date'] ) ? sanitize_text_field( wp_unslash( $_GET['date'] ) ) : '';
		$party = isset( $_GET['party'] ) ? max( 1, (int) $_GET['party'] ) : 1;

		if ( ! preg_match( '/^\d{4}-\d{2}-\d{2}$/', $date ) ) {
			wp_send_json_error( array( 'error' => 'Invalid date' ), 400 );
		}

		$result = Hospo_Ops_API::get_availability( $date, $party );
		if ( is_wp_error( $result ) ) {
			wp_send_json_error( array( 'error' => $result->get_error_message() ), 502 );
		}
		wp_send_json_success( $result );
	}

	public static function ajax_book() {
		check_ajax_referer( self::NONCE_ACTION, '_wpnonce' );

		$payload = array(
			'serviceId' => isset( $_POST['serviceId'] ) ? sanitize_text_field( wp_unslash( $_POST['serviceId'] ) ) : '',
			'date'      => isset( $_POST['date'] ) ? sanitize_text_field( wp_unslash( $_POST['date'] ) ) : '',
			'time'      => isset( $_POST['time'] ) ? sanitize_text_field( wp_unslash( $_POST['time'] ) ) : '',
			'partySize' => isset( $_POST['partySize'] ) ? max( 1, (int) $_POST['partySize'] ) : 1,
			'name'      => isset( $_POST['name'] ) ? sanitize_text_field( wp_unslash( $_POST['name'] ) ) : '',
			'phone'     => isset( $_POST['phone'] ) ? sanitize_text_field( wp_unslash( $_POST['phone'] ) ) : '',
			'email'     => isset( $_POST['email'] ) ? sanitize_email( wp_unslash( $_POST['email'] ) ) : '',
			'notes'     => isset( $_POST['notes'] ) ? sanitize_textarea_field( wp_unslash( $_POST['notes'] ) ) : '',
		);

		$result = Hospo_Ops_API::create_booking( $payload );
		if ( is_wp_error( $result ) ) {
			wp_send_json_error( array( 'error' => $result->get_error_message() ), 422 );
		}
		wp_send_json_success( $result );
	}

	// ── Config cache (5 min) ─────────────────────────────────────────────

	private static function cached_config() {
		$key = 'hospo_ops_config_' . md5( hospo_ops_app_url() . '|' . hospo_ops_api_key() );
		$config = get_transient( $key );
		if ( false !== $config ) {
			return $config;
		}

		$config = Hospo_Ops_API::get_config();
		if ( ! is_wp_error( $config ) ) {
			set_transient( $key, $config, 5 * MINUTE_IN_SECONDS );
		}
		return $config;
	}
}

/**
 * The sidebar widget wrapper around the shared renderer.
 */
class Hospo_Ops_Booking_Widget_Widget extends WP_Widget {

	public function __construct() {
		parent::__construct(
			'hospo_ops_booking',
			'HOSPO OPS Booking',
			array( 'description' => 'Book a table at this venue — powered by HOSPO OPS.' )
		);
	}

	public function widget( $args, $instance ) {
		echo $args['before_widget']; // phpcs:ignore
		if ( ! empty( $instance['title'] ) ) {
			echo $args['before_title'] . esc_html( $instance['title'] ) . $args['after_title']; // phpcs:ignore
		}
		echo Hospo_Ops_Booking_Widget::render(); // phpcs:ignore
		echo $args['after_widget']; // phpcs:ignore
	}

	public function form( $instance ) {
		$title = isset( $instance['title'] ) ? $instance['title'] : 'Book a table';
		?>
		<p>
			<label for="<?php echo esc_attr( $this->get_field_id( 'title' ) ); ?>">Title:</label>
			<input class="widefat" id="<?php echo esc_attr( $this->get_field_id( 'title' ) ); ?>" name="<?php echo esc_attr( $this->get_field_name( 'title' ) ); ?>" type="text" value="<?php echo esc_attr( $title ); ?>" />
		</p>
		<?php
	}

	public function update( $new_instance, $old_instance ) {
		$instance          = array();
		$instance['title'] = sanitize_text_field( $new_instance['title'] );
		return $instance;
	}
}

Hospo_Ops_Booking_Widget::init();
