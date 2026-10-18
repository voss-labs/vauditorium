import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("api/applications", "routes/api.applications.ts"),
  route("api/applications/:id/documents", "routes/api.applications.$id.documents.ts"),
  route("api/applications/:id/review", "routes/api.applications.$id.review.ts"),
  route("api/applications/:id/reply", "routes/api.applications.$id.reply.ts"),
  route("documents/:id", "routes/documents.$id.ts"),
] satisfies RouteConfig;
