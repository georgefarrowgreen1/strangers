export interface ProductRoute {
  id: string;
  name: string;
}
export const productRoutes: Readonly<Record<string, ProductRoute>>;
export function productPath(product: { id: string }): string;
export function productFromPath(path: string): ProductRoute | null;
