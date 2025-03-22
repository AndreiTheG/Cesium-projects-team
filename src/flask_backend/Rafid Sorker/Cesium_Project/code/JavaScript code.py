// Grant CesiumJS access to your Ion assets
Cesium.Ion.defaultAccessToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI0MzhlNTM0My05MzMxLTQ5OTEtOTMwMi1lMGY1YjNiMjQ4M2UiLCJpZCI6Mjc0NTYxLCJpYXQiOjE3MzkwOTU3OTV9.BKogj6YTsvY_FY-sTeFZ2cpPmhTnFzwG_77stoznb1s";

// Initialize the Cesium Viewer
const viewer = new Cesium.Viewer("cesiumContainer", {
  terrainProvider: Cesium.CesiumWorldTerrain, // Enable realistic terrain
});
viewer.scene.globe.depthTestAgainstTerrain = true; // Ensure model aligns with terrain

// Add the tileset (Harris Falcon II Military Radio)
(async function () {
 try {
  const tileset = await Cesium.Cesium3DTileset.fromIonAssetId(3065409);
  viewer.scene.primitives.add(tileset);
  await viewer.zoomTo(tileset);

  // Apply the default style if it exists
  const extras = tileset.asset.extras;
  if (
    Cesium.defined(extras) &&
    Cesium.defined(extras.ion) &&
    Cesium.defined(extras.ion.defaultStyle)
  ) {
    tileset.style = new Cesium.Cesium3DTileStyle(extras.ion.defaultStyle);
  }
} catch (error) {
  console.log(error);
}
})();

const signalEntity = viewer.entities.add({
  name: "Signal Coverage",
  position: Cesium.Cartesian3.fromDegrees(-74.0060, 40.7128, -19.6077993848),
  cylinder: {
    length: 500, // Signal range
    topRadius: 0,
    bottomRadius: new Cesium.CallbackProperty(function (time) {
      return 200 + 50 * Math.sin(time.secondsOfDay); // Pulsating effect
    }, false),
    material: Cesium.Color.GREEN.withAlpha(0.5),
  },
});

// Add **Interference Zone** Simulation
viewer.entities.add({
  name: "Interference Signal",
  position: Cesium.Cartesian3.fromDegrees(-74.0070, 40.7125, -19.6077993848), // Slightly offset
  ellipsoid: {
    radii: new Cesium.Cartesian3(150, 150, 150),
    material: Cesium.Color.RED.withAlpha(0.4), // Semi-transparent red for interference
  },
});

// **Live Signal Strength Updates** (Every Second)
setInterval(() => {
  signalEntity.cylinder.bottomRadius = 150 + Math.random() * 100; // Random signal fluctuation
}, 1000);
