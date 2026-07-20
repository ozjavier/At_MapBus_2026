// src/pages/api/walk-directions.js
//
// Proxy server-side hacia Google Routes API (modo WALK), usado como
// respaldo cuando OSRM devuelve una ruta peatonal desproporcionadamente
// larga (ver fetchWalkPath en routeFinder.js). Vive en el servidor para
// que la API key de Google nunca se exponga en el cliente.

export const prerender = false;

export async function POST({ request }) {
  const apiKey = import.meta.env.GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    console.error("GOOGLE_MAPS_API_KEY no esta configurada en el servidor.");
    return new Response(
      JSON.stringify({ error: "Servicio de rutas no disponible." }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "JSON invalido." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { origin, destination } = body ?? {};
  if (!origin?.lat || !origin?.lng || !destination?.lat || !destination?.lng) {
    return new Response(
      JSON.stringify({
        error: "Se requiere origin y destination con lat/lng.",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    const googleRes = await fetch(
      "https://routes.googleapis.com/directions/v2:computeRoutes",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          // Field mask obligatorio en Routes API: solo pedimos lo que
          // realmente usamos, para no pagar de mas por datos que no
          // consultamos.
          "X-Goog-FieldMask":
            "routes.polyline.encodedPolyline,routes.distanceMeters",
        },
        body: JSON.stringify({
          origin: {
            location: {
              latLng: { latitude: origin.lat, longitude: origin.lng },
            },
          },
          destination: {
            location: {
              latLng: {
                latitude: destination.lat,
                longitude: destination.lng,
              },
            },
          },
          travelMode: "WALK",
        }),
      },
    );

    if (!googleRes.ok) {
      const errorText = await googleRes.text();
      console.error("Google Routes API error:", googleRes.status, errorText);
      return new Response(
        JSON.stringify({ error: "Error consultando Google Routes API." }),
        { status: 502, headers: { "Content-Type": "application/json" } },
      );
    }

    const data = await googleRes.json();
    const route = data.routes?.[0];

    if (!route?.polyline?.encodedPolyline) {
      return new Response(JSON.stringify({ error: "Sin ruta disponible." }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        polyline: route.polyline.encodedPolyline,
        distanceMeters: route.distanceMeters ?? null,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error llamando a Google Routes API:", error);
    return new Response(
      JSON.stringify({ error: "Error interno consultando rutas." }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
