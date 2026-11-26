export const SHIPPING_PENCE: number;
export const FREE_SHIPPING_FROM_PENCE: number;
export function isWholesaleDelivery(value: unknown): boolean;
export function shippingFor(delivery: string, coffeePence: number): number;
