<?php
/**
 * Divi module: HOSPO OPS Checkout.
 *
 * The dining details block for the WooCommerce checkout page. Drop it
 * anywhere in your Divi checkout layout — the frontend script relocates it
 * inside the checkout form (just above payment) so the fields submit with
 * the order.
 */
class HospoOpsCheckout extends ET_Builder_Module {

	public $slug       = 'hospo_ops_checkout';
	public $vb_support = 'on';

	protected $module_credits = array(
		'module_uri' => '',
		'author'     => 'HOSPO OPS',
		'author_uri' => '',
	);

	public function init() {
		$this->name = esc_html__( 'HOSPO OPS Checkout', 'hospo-ops' );
		$this->icon_path = HOSPO_OPS_DIR . 'divi/includes/modules/HospoOpsBooking/icon.svg';
	}

	public function get_fields() {
		return array(
			'heading' => array(
				'label'           => esc_html__( 'Heading', 'hospo-ops' ),
				'type'            => 'text',
				'default'         => 'Dining details',
				'option_category' => 'basic_option',
				'description'     => esc_html__( 'The heading shown above the dining details.', 'hospo-ops' ),
			),
		);
	}

	public function render( $attrs, $content = null, $render_slug = '' ) {
		if ( function_exists( 'et_core_is_fb_enabled' ) && et_core_is_fb_enabled() ) {
			return '<div class="hospo-ops-block-placeholder">HOSPO OPS — CHECKOUT DINING DETAILS (renders on the frontend)</div>';
		}

		// Renders '' on the order-received page and anywhere that is not the
		// checkout form — the module only ever appears where dining details
		// can be chosen.
		return Hospo_Ops_Checkout::render_section( true );
	}
}

new HospoOpsCheckout();
