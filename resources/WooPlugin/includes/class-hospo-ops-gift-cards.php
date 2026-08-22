<?php
/**
 * Attaches gift card PDFs to WooCommerce order emails.
 *
 * When an order contains a product from the venue's GIFT CARDS category
 * (the category id is served by /api/public/config), the app auto-creates
 * and auto-issues the gift card on sync. This class fetches the generated
 * PDF(s) from the app and attaches them to the order emails — the customer
 * emails AND the admin new-order email.
 *
 * A fetch failure never blocks the email: it logs and sends without the
 * attachment, and a later email (completed order, invoice…) retries.
 */
class Hospo_Ops_Gift_Cards {

	/**
	 * Email ids that carry the gift card PDF. `new_order` is the admin
	 * notification; the rest are customer-facing.
	 */
	const TARGET_EMAIL_IDS = array(
		'new_order',
		'customer_processing_order',
		'customer_completed_order',
		'customer_on_hold_order',
		'customer_invoice',
	);

	/**
	 * Backoff (seconds) between fetch attempts. The store's email usually
	 * fires before or around the app's webhook — these delays ride out the
	 * race, and the app generates the PDF lazily when asked.
	 */
	const RETRY_DELAYS = array( 0, 2, 5, 10 );

	public static function init() {
		add_filter( 'woocommerce_email_attachments', array( __CLASS__, 'attach_gift_card_pdf' ), 10, 3 );
	}

	/**
	 * Add the gift card PDF to a matching order email.
	 *
	 * @param array  $attachments
	 * @param string $email_id The WC_Email id (e.g. 'customer_processing_order').
	 * @param mixed  $order    The email's object (WC_Order for order emails).
	 * @return array
	 */
	public static function attach_gift_card_pdf( $attachments, $email_id, $order ) {
		if ( ! in_array( $email_id, self::TARGET_EMAIL_IDS, true ) || ! $order ) {
			return $attachments;
		}

		$order_id = is_callable( array( $order, 'get_id' ) ) ? $order->get_id() : 0;
		if ( ! $order_id ) {
			return $attachments;
		}

		$order = wc_get_order( $order_id );
		if ( ! $order || ! self::order_has_gift_card( $order ) ) {
			return $attachments;
		}

		$pdf = self::cached_or_fetch( $order_id );
		if ( is_wp_error( $pdf ) || ! is_file( $pdf ) ) {
			self::log(
				sprintf(
					'Gift card PDF unavailable for order %d — email sent without attachment (%s)',
					$order_id,
					is_wp_error( $pdf ) ? $pdf->get_error_message() : 'file missing'
				)
			);
			return $attachments;
		}

		$attachments[] = $pdf;
		return $attachments;
	}

	/**
	 * Does this order contain a product from the venue's GIFT CARDS category?
	 */
	private static function order_has_gift_card( $order ) {
		$config = Hospo_Ops_Booking_Widget::cached_config();
		$cat    = ! is_wp_error( $config ) && ! empty( $config['giftCardCategoryId'] ) ? (string) $config['giftCardCategoryId'] : '';
		if ( ! $cat ) {
			return false; // Venue hasn't linked a GIFT CARDS category.
		}

		foreach ( $order->get_items() as $item ) {
			$product = $item->get_product();
			if ( ! $product ) {
				continue;
			}
			foreach ( $product->get_category_ids() as $cid ) {
				if ( (string) $cid === $cat ) {
					return true;
				}
			}
		}
		return false;
	}

	/**
	 * Fetch the PDF (cached per order for a week, success only — a failure
	 * stays uncached so the next email retries).
	 *
	 * @return string|WP_Error Local file path on success.
	 */
	private static function cached_or_fetch( $order_id ) {
		$key  = 'hospo_ops_gift_pdf_' . $order_id;
		$file = get_transient( $key );
		if ( is_string( $file ) && is_file( $file ) ) {
			return $file;
		}

		$pdf = null;
		foreach ( self::RETRY_DELAYS as $delay ) {
			if ( $delay ) {
				sleep( $delay );
			}
			$pdf = Hospo_Ops_API::get_order_gift_card_pdf( $order_id );
			if ( ! is_wp_error( $pdf ) ) {
				set_transient( $key, $pdf, WEEK_IN_SECONDS );
				return $pdf;
			}
		}
		return $pdf;
	}

	private static function log( $message ) {
		if ( function_exists( 'wc_get_logger' ) ) {
			wc_get_logger()->warning( 'HOSPO OPS: ' . $message, array( 'source' => 'hospo-ops' ) );
		}
	}
}

Hospo_Ops_Gift_Cards::init();
