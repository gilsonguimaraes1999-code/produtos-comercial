import { createFileRoute } from "@tanstack/react-router";
import { AppPage } from "@/app/AppPage";

const title = "Dashboard | Comercial Produtos";
const description = "Catálogo comercial de produtos.";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: "Comercial Produtos" },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DashboardRoute,
});

function DashboardRoute() {
  return <AppPage routeMode="dashboard" />;
}
