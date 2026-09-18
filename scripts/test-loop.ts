/**
 * End-to-end smoke test for the MVP loop:
 *   create users -> create a Pack/Toli -> start a Trip ->
 *   log location pings -> upload media -> end trip -> generate Memory Stream
 *
 * Run this AFTER `npm run dev` is already running in another terminal.
 *
 * Usage:
 *   npx ts-node scripts/test-loop.ts
 */

const BASE_URL = process.env.API_URL || "http://localhost:4000";

async function post(path: string, body: any) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`${path} failed: ${JSON.stringify(data)}`);
  return data;
}

async function get(path: string): Promise<any> {
  const res = await fetch(`${BASE_URL}${path}`);
  const data: any = await res.json();
  if (!res.ok) throw new Error(`${path} failed: ${JSON.stringify(data)}`);
  return data;
}

async function main() {
  console.log("1. Creating two test users...");
  const maya = await post("/users", { phoneNumber: "+15550000001", displayName: "Maya" });
  const sam = await post("/users", { phoneNumber: "+15550000002", displayName: "Sam" });
  console.log(`   Created ${maya.display_name} and ${sam.display_name}`);

  console.log("2. Creating a Pack/Toli...");
  const pack = await post("/packs", { name: "Yosemite Crew", creatorId: maya.id });
  console.log(`   Pack/Toli created: ${pack.name} (${pack.id})`);

  console.log("3. Adding Sam to the Pack/Toli...");
  await post(`/packs/${pack.id}/members`, { userId: sam.id });
  console.log("   Sam added");

  console.log("4. Starting a Trip...");
  const trip = await post("/trips", {
    packId: pack.id,
    name: "Weekend in Yosemite",
    discussionLocation: "Group chat, obviously",
  });
  console.log(`   Trip started: ${trip.name} (${trip.id})`);

  console.log("5. Logging location pings for both members along a route...");
  const route: [number, number][] = [
    [37.7749, -122.4194], // SF
    [37.6, -121.9],
    [37.4, -120.8],
    [37.8651, -119.5383], // Yosemite Valley
  ];
  const now = Date.now();
  for (const [lat, lng] of route) {
    await post(`/trips/${trip.id}/pings`, {
      userId: maya.id,
      lat,
      lng,
      capturedAt: new Date(now).toISOString(),
    });
  }
  console.log(`   Logged ${route.length} pings`);

  console.log("6. Uploading a couple of photos along the route...");
  await post(`/trips/${trip.id}/media`, {
    userId: maya.id,
    url: "https://example.com/photo1.jpg",
    capturedAt: new Date(now).toISOString(),
  });
  await post(`/trips/${trip.id}/media`, {
    userId: sam.id,
    url: "https://example.com/photo2.jpg",
    capturedAt: new Date(now + 15 * 60 * 1000).toISOString(),
  });
  console.log("   Uploaded 2 photos");

  console.log("7. Ending the trip...");
  await post(`/trips/${trip.id}/end`, {});
  console.log("   Trip ended");

  console.log("8. Generating the Memory Stream...");
  const stream = await get(`/trips/${trip.id}/memory-stream`);
  console.log(`   Route points: ${stream.route.length}`);
  console.log(`   Bubbles: ${stream.bubbles.length}`);
  console.log(JSON.stringify(stream, null, 2));

  console.log("\n✅ Full loop completed successfully.");
}

main().catch((err) => {
  console.error("❌ Loop failed:", err.message);
  process.exit(1);
});
