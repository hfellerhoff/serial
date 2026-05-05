import { createServerFn } from "@tanstack/react-start";
import { fetchProducts } from "./products";

export const fetchProductsServerFn = createServerFn({
  method: "GET",
}).handler(async () => {
  return fetchProducts();
});
