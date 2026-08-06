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
		add_action( 'admin_enqueue_scripts', array( __CLASS__, 'enqueue_assets' ) );

		// Public AJAX handlers (customers are not logged in).
		add_action( 'wp_ajax_hospo_ops_config', array( __CLASS__, 'ajax_config' ) );
		add_action( 'wp_ajax_nopriv_hospo_ops_config', array( __CLASS__, 'ajax_config' ) );
		add_action( 'wp_ajax_hospo_ops_availability', array( __CLASS__, 'ajax_availability' ) );
		add_action( 'wp_ajax_nopriv_hospo_ops_availability', array( __CLASS__, 'ajax_availability' ) );
		add_action( 'wp_ajax_hospo_ops_book', array( __CLASS__, 'ajax_book' ) );
		add_action( 'wp_ajax_nopriv_hospo_ops_book', array( __CLASS__, 'ajax_book' ) );
	}

	// ── Shortcode ────────────────────────────────────────────────────────

	public static function render_shortcode( $atts = array() ) {
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

	public static function render_block( $attributes = array() ) {
		$service = isset( $attributes['service'] ) ? $attributes['service'] : '';
		return self::render( $service );
	}

	// ── Assets ───────────────────────────────────────────────────────────

	public static function enqueue_assets() {
		// Frontend: always load (Divi stores its modules in formats a content
		// scan can miss, and the files are small).
		$should_load = ! is_admin();

		// Admin: only on the order edit screens (classic + HPOS).
		if ( is_admin() && function_exists( 'get_current_screen' ) ) {
			$screen = get_current_screen();
			$should_load = $screen && in_array( $screen->id, array( 'shop_order', 'woocommerce_page_wc-orders' ), true );
		}

		if ( ! $should_load ) {
			return;
		}
		if ( ! apply_filters( 'hospo_ops_enqueue_assets', true ) ) {
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

		// A fresh nonce per render keeps the public form usable.
		ob_start();
		?>
		<div class="hospo-ops-widget" data-hospo-widget>
			<div class="hospo-ops-section">
				<label class="hospo-ops-label">Party size</label>
				<input type="number" data-hospo-party min="1" max="30" step="1" value="2" />
			</div>

			<div class="hospo-ops-section">
				<label class="hospo-ops-label">Service</label>
				<div class="hospo-ops-services" data-hospo-services>
					<?php echo self::render_service_list( $config['services'], array(), $selected ); // phpcs:ignore ?>
				</div>
			</div>
			<input type="hidden" data-hospo-service-input value="<?php echo esc_attr( $selected ); ?>" />

			<div class="hospo-ops-section">
				<label class="hospo-ops-label">Time</label>
				<div class="hospo-ops-slots" data-hospo-slots></div>
			</div>

			<div class="hospo-ops-fields" data-hospo-fields hidden>
				<div class="hospo-ops-row">
					<div class="hospo-ops-field">
						<input type="text" data-hospo-name placeholder="Full name" required />
					</div>
					<div class="hospo-ops-field">
						<input type="tel" data-hospo-phone placeholder="Phone" />
					</div>
				</div>
				<div class="hospo-ops-field">
					<input type="email" data-hospo-email placeholder="Email (optional)" />
				</div>
				<button type="button" class="hospo-ops-submit" data-hospo-submit>Book table</button>
				<p class="hospo-ops-message" data-hospo-message hidden></p>
			</div>
		</div>
		<?php
		return ob_get_clean();
	}

	/**
	 * Server-rendered service boxes with date buttons (the same list the JS
	 * wires up). Mirrors the JS date logic so the module shows its services
	 * even before (or without) the frontend script.
	 *
	 * @param array  $services       Config services.
	 * @param array  $menu_ids       Service ids whose menu is in the cart ("your menu" tag).
	 * @param string $only_service   Show just this service id ('' = all).
	 */
	public static function render_service_list( $services, $menu_ids = array(), $only_service = '' ) {
		$html = '';

		foreach ( $services as $service ) {
			if ( '' !== $only_service && $service['id'] !== $only_service ) {
				continue;
			}
			$dates = self::next_dates( $service );
			if ( empty( $dates ) ) {
				continue;
			}

			$html .= '<div class="hospo-ops-service" data-service="' . esc_attr( $service['id'] ) . '">';
			$html .= '<div class="hospo-ops-service-name">' . esc_html( $service['name'] ) . '</div>';

			$html .= '<div class="hospo-ops-dates">';
			foreach ( $dates as $key ) {
				$html .= '<button type="button" class="hospo-ops-date-btn" data-date="' . esc_attr( $key ) . '">' . esc_html( self::format_date_btn( $key ) ) . '</button>';
			}
			$html .= '</div></div>';
		}

		if ( '' === $html ) {
			return '<p class="hospo-ops-note">No services available in the next 30 days.</p>';
		}
		return $html;
	}

	/** The next up-to-6 dates a service runs within 30 days (UTC day keys). */
	private static function next_dates( $service, $limit = 6 ) {
		$out    = array();
		$now    = new DateTimeImmutable( 'now', new DateTimeZone( 'UTC' ) );
		$exceptions = isset( $service['exceptions'] ) ? $service['exceptions'] : array();
		$slots      = isset( $service['slots'] ) ? $service['slots'] : array();

		for ( $i = 1; $i <= 30 && count( $out ) < $limit; $i++ ) {
			$d   = $now->modify( "+{$i} days" );
			$key = $d->format( 'Y-m-d' );

			$closed   = false;
			$override = false;
			foreach ( $exceptions as $ex ) {
				if ( $ex['date'] === $key ) {
					if ( ! empty( $ex['closed'] ) ) {
						$closed = true;
					}
					if ( ! empty( $ex['startTime'] ) ) {
						$override = true;
					}
					break;
				}
			}
			if ( $closed ) {
				continue;
			}
			if ( $override ) {
				$out[] = $key;
				continue;
			}

			$dow = (int) $d->format( 'w' ); // 0=Sun .. 6=Sat
			foreach ( $slots as $slot ) {
				if ( (int) $slot['dayOfWeek'] === $dow ) {
					$out[] = $key;
					break;
				}
			}
		}

		return $out;
	}

	/** "2026-08-14" → "FRI 14". */
	private static function format_date_btn( $key ) {
		return strtoupper( gmdate( 'D j', strtotime( $key . 'T00:00:00Z' ) ) );
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

	public static function cached_config() {
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
