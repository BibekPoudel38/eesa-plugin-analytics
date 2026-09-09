/**
 * The app's vocabulary, in the words a restaurant uses.
 *
 * The client names its events for the people who wrote it — `add_to_cart`,
 * `payment_started`, `props`. This dashboard is read by the people who run the
 * restaurant, and "payment_started" is not a thing any of them would say.
 *
 * The technical name is never thrown away; it is kept beside the plain one for
 * whoever is checking the integration. It just stops being the headline.
 */

const EVENTS: Record<string, string> = {
  add_to_cart: "Added to basket",
  payment_started: "Started checkout",
  place_order: "Order placed",
  apply_coupon: "Coupon used",
  remove_from_cart: "Removed from basket",
  begin_checkout: "Started checkout",
  search: "Searched",
  sign_up: "Signed up",
  login: "Signed in",
};

const FIELDS: Record<string, string> = {
  item_name: "Dish",
  item_id: "Dish reference",
  quantity: "How many",
  unit_price: "Price each",
  item_count: "Items in basket",
  service_type: "Delivery or pickup",
  payment_kind: "Paid with",
  total: "Order total",
  code: "Coupon code",
  discount_amount: "Discount",
};

/** "add_to_cart" → "Added to basket"; anything unmapped is at least readable. */
export function eventLabel(name: string): string {
  return EVENTS[name] ?? sentence(name);
}

/** "unit_price" → "Price each". */
export function fieldLabel(key: string): string {
  return FIELDS[key] ?? sentence(key);
}

/** "wallet_partial" → "Wallet partial". Used for values as well as names. */
export function sentence(raw: string): string {
  const t = (raw || "").replace(/[_-]+/g, " ").trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : "";
}
