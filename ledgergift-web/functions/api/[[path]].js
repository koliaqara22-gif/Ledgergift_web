import worker from "../../worker.js";

// Cloudflare Pages invokes this file for every /api/* request.
// The existing Worker keeps handling authentication, D1, deals and admin logic.
export async function onRequest(context) {
  return worker.fetch(context.request, context.env);
}
