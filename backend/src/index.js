export default {
  fetch(request) {
    const url = new URL(request.url);

    if (url.pathname !== "/api/hello") {
      return new Response("Not Found", { status: 404 });
    }

    if (request.method !== "GET") {
      return new Response("Method Not Allowed", {
        status: 405,
        headers: { Allow: "GET" },
      });
    }

    return Response.json({ message: "Voice Budget backend is working" });
  },
};
