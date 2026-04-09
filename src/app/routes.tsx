import { createBrowserRouter, redirect } from "react-router";
import { Login } from "./pages/Login";
import { Register } from "./pages/Register";
import { Layout } from "./components/Layout";
import { OrderPage } from "./pages/OrderPage";
import { RealTimeOrders } from "./pages/RealTimeOrders";
import { InvoiceView } from "./pages/InvoiceView";
import { SettlementView } from "./pages/SettlementView";
import { ProfileStorage } from "./pages/ProfileStorage";
import { ProductGuide } from "./pages/ProductGuide";

export const router = createBrowserRouter([
  {
    path: "/",
    loader: () => {
      return redirect("/login");
    },
    Component: Login,
  },
  {
    path: "/login",
    Component: Login,
  },
  {
    path: "/register",
    Component: Register,
  },
  {
    path: "/app",
    Component: Layout,
    children: [
      { index: true, Component: OrderPage },
      { path: "orders", Component: RealTimeOrders },
      { path: "invoice", Component: InvoiceView },
      { path: "settlement", Component: SettlementView },
      { path: "profile", Component: ProfileStorage },
      { path: "products", Component: ProductGuide },
    ],
  },
], { basename: import.meta.env.BASE_URL });
