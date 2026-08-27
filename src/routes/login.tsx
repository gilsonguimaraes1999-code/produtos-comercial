import { createFileRoute } from "@tanstack/react-router";
import { AppPage } from "@/app/AppPage";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Login | Comercial Produtos" },
      { name: "description", content: "Acesse o site Comercial Produtos." },
    ],
  }),
  component: LoginRoute,
});

function LoginRoute() {
  return <AppPage routeMode="login" />;
}
