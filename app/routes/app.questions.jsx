import { json } from "@remix-run/node";
import { Outlet, useLoaderData } from "@remix-run/react";
import { authenticate } from "../shopify.server";

// Loader for questions layout
export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const { shop } = session;

  // Fetch products for the product selector
  const productsResponse = await admin.graphql(`
    query getProducts($first: Int!) {
      products(first: $first) {
        nodes {
          id
          title
          handle
          status
          featuredImage {
            url
            altText
          }
          description(truncateAt: 120)
        }
      }
    }
  `, {
    variables: { first: 50 }
  });

  const { data } = await productsResponse.json();

  return json({
    products: data.products.nodes,
    shop: shop
  });
};

// Layout component for /app/questions/* routes
export default function QuestionsLayout() {
  const { products, shop } = useLoaderData();
  return <Outlet context={{ products, shop }} />;
}