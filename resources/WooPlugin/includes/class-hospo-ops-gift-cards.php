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
	 * race (the app pulls the paid order and mints the card within seconds of
	 * the webhook), and the app generates the PDF lazily when asked. Sleeps
	 * only happen while the fetch is failing, so a successful first fetch
	 * never delays the email.
	 */
	const RETRY_DELAYS = array( 0, 2, 10, 30 );

	public static function init() {
		add_filter( 'woocommerce_email_attachments', array( __CLASS__, 'attach_gift_card_pdf' ), 10, 3 );
		add_action( 'woocommerce_admin_order_data_after_order_details', array( __CLASS__, 'admin_order_gift_card_box' ), 20, 1 );
		add_action( 'wp_ajax_hospo_ops_gift_pdf', array( __CLASS__, 'ajax_download_gift_pdf' ) );
		add_action( 'wp_ajax_hospo_ops_resend_gift_email', array( __CLASS__, 'ajax_resend_gift_email' ) );
	}

	/**
	 * A small box on the wp-admin order edit screen: shows the gift card PDF
	 * once the order is PAID (payment pending → a plain note), with a link
	 * that fetches the issued PDF from the app on demand.
	 */
	public static function admin_order_gift_card_box( $order ) {
		if ( ! $order || ! method_exists( $order, 'get_meta' ) || ! method_exists( $order, 'is_paid' ) ) {
			return;
		}
		if ( ! self::order_has_gift_card( $order ) ) {
			return; // No gift card category product on this order.
		}

		$order = wc_get_order( $order->get_id() );
		if ( ! $order ) {
			return;
		}
		$download_url = add_query_arg(
			array(
				'action'   => 'hospo_ops_gift_pdf',
				'order'    => $order->get_id(),
				'_wpnonce' => wp_create_nonce( 'hospo_ops_gift_pdf' ),
			),
			admin_url( 'admin-ajax.php' )
		);
		?>
		<div class="hospo-ops-gift-admin" style="margin-top:14px;padding-top:12px;border-top:1px dashed #d0d0d0;">
			<h3 style="font-size:13px;font-weight:600;margin:0 0 8px;">GIFT CARD</h3>
		<?php if ( $order->is_paid() ) : ?>
			<p style="font-size:12px;color:#1d2327;margin:0 0 8px;">
				This order's gift card is issued. Open the PDF from the app — it also rides the order emails.
			</p>
			<div style="display:flex;gap:8px;flex-wrap:wrap;">
				<a href="<?php echo esc_url( $download_url ); ?>" style="display:inline-block;background:#7f54b3;color:#fff;padding:6px 12px;font-size:12px;text-decoration:none;border-radius:3px;">
					VIEW GIFT CARD PDF
				</a>
				<button
					type="button"
					id="hospo-ops-resend-gift-<?php echo esc_attr( $order->get_id() ); ?>"
					data-order="<?php echo esc_attr( $order->get_id() ); ?>"
					data-nonce="<?php echo esc_attr( wp_create_nonce( 'hospo_ops_resend_gift_email' ) ); ?>"
					style="display:inline-block;background:#fff;color:#1d2327;border:1px solid #8c8f94;padding:6px 12px;font-size:12px;text-decoration:none;border-radius:3px;cursor:pointer;"
				>
					RESEND GIFT CARD EMAIL
				</button>
			</div>
			<script>
			( function () {
				var btn = document.getElementById( 'hospo-ops-resend-gift-<?php echo esc_js( $order->get_id() ); ?>' );
				if ( ! btn ) { return; }
				btn.addEventListener( 'click', function () {
					if ( ! window.confirm( 'Email the gift card PDF to the customer now?' ) ) { return; }
					var url = ajaxurl + '?action=hospo_ops_resend_gift_email&order=' + btn.getAttribute( 'data-order' ) + '&_wpnonce=' + encodeURIComponent( btn.getAttribute( 'data-nonce' ) );
					btn.disabled = true;
					fetch( url, { credentials: 'same-origin' } )
						.then( function ( r ) { return r.json(); } )
						.then( function ( d ) {
							window.alert( d && d.data && d.data.message ? d.data.message : ( d && d.data && d.data.error ? d.data.error : 'Send failed — see WooCommerce logs.' ) );
						} )
						.catch( function () { window.alert( 'Send failed — see WooCommerce logs.' ); } )
						.finally( function () { btn.disabled = false; } );
				} );
			} )();
			</script>
		<?php else : ?>
				<p style="font-size:12px;color:#b32d2e;margin:0;">
					Payment pending — the gift card PDF is issued once payment is confirmed.
				</p>
			<?php endif; ?>
		</div>
		<?php
	}

	/**
	 * wp-admin ajax: resend the order's gift card email to the customer. Used
	 * after the app REPLACES a card (void + reissue) so the corrected PDF —
	 * fetched fresh from the app — reaches the customer immediately. WooCommerce
	 * has no API to fire emails, so this is a wp-admin click.
	 */
	public static function ajax_resend_gift_email() {
		check_ajax_referer( 'hospo_ops_resend_gift_email' );
		if ( ! current_user_can( 'edit_shop_orders' ) ) {
			wp_die( -1 );
		}

		$order_id = isset( $_GET['order'] ) ? absint( $_GET['order'] ) : 0; // phpcs:ignore WordPress.Security.NonceVerification.Recommended
		$order    = $order_id ? wc_get_order( $order_id ) : null;
		if ( ! $order || ! $order->is_paid() || ! self::order_has_gift_card( $order ) ) {
			wp_send_json_error( array( 'error' => 'Not available — payment must be confirmed and the order must contain a gift card.' ) );
		}
		if ( ! $order->get_billing_email() ) {
			wp_send_json_error( array( 'error' => 'This order has no customer email address.' ) );
		}

		// The status-appropriate customer email, invoice as the fallback — the
		// gift card PDF rides all of these (see TARGET_EMAIL_IDS).
		$by_status = array(
			'processing' => 'WC_Email_Customer_Processing_Order',
			'completed'  => 'WC_Email_Customer_Completed_Order',
			'on-hold'    => 'WC_Email_Customer_On_Hold_Order',
		);
		$email_id = isset( $by_status[ $order->get_status() ] ) ? $by_status[ $order->get_status() ] : 'WC_Email_Customer_Invoice';

		$mailer = WC()->mailer();
		if ( ! isset( $mailer->emails[ $email_id ] ) ) {
			wp_send_json_error( array( 'error' => 'The ' . $email_id . ' email is not available.' ) );
		}

		$email = $mailer->emails[ $email_id ];
		if ( ! $email->is_enabled() ) {
			$email_id = 'WC_Email_Customer_Invoice';
			if ( ! isset( $mailer->emails[ $email_id ] ) || ! $mailer->emails[ $email_id ]->is_enabled() ) {
				wp_send_json_error( array( 'error' => 'No customer email is enabled for this order (enable the invoice or order emails).' ) );
			}
			$email = $mailer->emails[ $email_id ];
		}

		$email->trigger( $order->get_id() );
		self::log(
			sprintf(
				'Gift card email resent for order %d via %s to %s',
				$order->get_id(),
				$email_id,
				$order->get_billing_email()
			)
		);
		wp_send_json_success( array( 'message' => 'Gift card email sent to ' . $order->get_billing_email() . '.' ) );
	}

	/**
	 * wp-admin ajax: stream the order's gift card PDF (fetched from the app
	 * server-side with the API key — never exposed to the browser).
	 */
	public static function ajax_download_gift_pdf() {
		check_ajax_referer( 'hospo_ops_gift_pdf' );
		if ( ! current_user_can( 'edit_shop_orders' ) ) {
			wp_die( -1 );
		}

		$order_id = isset( $_GET['order'] ) ? absint( $_GET['order'] ) : 0; // phpcs:ignore WordPress.Security.NonceVerification.Recommended
		$order    = $order_id ? wc_get_order( $order_id ) : null;
		if ( ! $order || ! $order->is_paid() || ! self::order_has_gift_card( $order ) ) {
			wp_send_json_error( array( 'error' => 'Not available yet — payment must be confirmed.' ) );
		}

		// Single direct fetch (no email retry loop — the store email already
		// attached a copy; this is the on-demand view).
		$pdf = Hospo_Ops_API::get_order_gift_card_pdf( $order_id );
		if ( is_wp_error( $pdf ) || ! is_file( $pdf ) ) {
			wp_send_json_error(
				array(
					'error' => is_wp_error( $pdf )
						? $pdf->get_error_message()
						: 'Gift card PDF is not ready yet.',
				)
			);
		}

		header( 'Content-Type: application/pdf' );		header( 'Content-Disposition: attachment; filename="Gift Card - Order ' . $order_id . '.pdf"' );
		readfile( $pdf ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_readfile
		exit;
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
	 * Variations carry no categories — resolve to the parent product.
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
			$parent_id = method_exists( $product, 'get_parent_id' ) ? $product->get_parent_id() : 0;
			$lookup    = $parent_id ? wc_get_product( $parent_id ) : $product;
			if ( ! $lookup ) {
				$lookup = $product;
			}
			foreach ( $lookup->get_category_ids() as $cid ) {
				if ( (string) $cid === $cat ) {
					return true;
				}
			}
		}
		return false;
	}

	/**
	 * Fetch the PDF afresh for every email (no file cache).
	 *
	 * The app's public endpoint generates lazily and skips VOIDED cards, so a
	 * refetch is the only way a REPLACED card (void + reissue from the app)
	 * reaches the next order email — a cached path would attach the stale,
	 * voided card's PDF. The retry loop still rides out the payment-confirmed →
	 * card-minted race (a 404 is transient).
	 *
	 * @return string|WP_Error Local file path on success.
	 */
	private static function cached_or_fetch( $order_id ) {
		$pdf = null;
		foreach ( self::RETRY_DELAYS as $delay ) {
			if ( $delay ) {
				sleep( $delay );
			}
			$pdf = Hospo_Ops_API::get_order_gift_card_pdf( $order_id );
			if ( ! is_wp_error( $pdf ) ) {
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
