import { createBrowserRouter } from "react-router";
import { Login } from "./pages/Login";
import { Register } from "./pages/Register";
import { Layout } from "./components/Layout";
import { OrderPage } from "./pages/OrderPage";
import { RealTimeOrders } from "./pages/RealTimeOrders";
import { InvoiceView } from "./pages/InvoiceView";
import { SettlementView } from "./pages/SettlementView";
import { ProfileStorage } from "./pages/ProfileStorage";
import { MessageSettings } from "./pages/MessageSettings";
import { ProductGuide } from "./pages/ProductGuide";

export const router = createBrowserRouter([
  {
    path: "/",
    loader: () => {
      return Response.redirect("/login");
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
      { path: "messages", Component: MessageSettings },
      { path: "products", Component: ProductGuide },
    ],
  },
]);