/* ============================================================
   main.js — entry point
   ============================================================ */
import { store } from "./store.js";
import { buildSprite } from "./icons.js";
import { start } from "./router.js";

store.hydrate();
buildSprite();
start();
