import { createFileRoute } from "@tanstack/react-router";
import { AppPage } from "@/app/AppPage";

const title = "Comercial Produtos";
const description = "Catálogo comercial de produtos.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return <AppPage routeMode="auto" />;
}
