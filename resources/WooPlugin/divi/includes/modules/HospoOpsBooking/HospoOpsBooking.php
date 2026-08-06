<?php
/**
 * Divi module: HOSPO OPS Booking.
 *
 * Wraps the booking-only widget (the same renderer behind the shortcode and
 * sidebar widget) so it can be dragged onto Divi pages from the module list.
 * In the Divi visual builder it shows a placeholder; the live widget renders
 * on the frontend.
 */
class HospoOpsBooking extends ET_Builder_Module {

	public $slug       = 'hospo_ops_booking';
	public $vb_support = 'on';

	protected $module_credits = array(
		'module_uri'   => '',
		'author'       => 'HOSPO OPS',
		'author_uri'   => '',
	);

	public function init() {
		$this->name = esc_html__( 'HOSPO OPS Booking', 'hospo-ops' );
		$this->icon_path = HOSPO_OPS_DIR . 'divi/includes/modules/HospoOpsBooking/icon.svg';
	}

	public function get_fields() {
		return array(
			'title'   => array(
				'label'           => esc_html__( 'Heading (optional)', 'hospo-ops' ),
				'type'            => 'text',
				'option_category' => 'basic_option',
				'description'     => esc_html__( 'A heading shown above the booking widget.', 'hospo-ops' ),
			),
			'service' => array(
				'label'           => esc_html__( 'Service ID (optional)', 'hospo-ops' ),
				'type'            => 'text',
				'option_category' => 'basic_option',
				'description'     => esc_html__( 'Preselect one service by its HOSPO OPS id. Leave blank to show all services.', 'hospo-ops' ),
			),
		);
	}

	public function render( $attrs, $content = null, $render_slug = '' ) {
		// The builder canvas is not the live page — show a static placeholder.
		if ( function_exists( 'et_core_is_fb_enabled' ) && et_core_is_fb_enabled() ) {
			return '<div class="hospo-ops-block-placeholder">HOSPO OPS — BOOK A TABLE (renders on the frontend)</div>';
		}

		$html = '';
		if ( ! empty( $this->props['title'] ) ) {
			$html .= '<h3 class="hospo-ops-module-heading">' . esc_html( $this->props['title'] ) . '</h3>';
		}

		$service = isset( $this->props['service'] ) ? $this->props['service'] : '';
		$html   .= Hospo_Ops_Booking_Widget::render( $service );

		return $html;
	}
}

new HospoOpsBooking();
