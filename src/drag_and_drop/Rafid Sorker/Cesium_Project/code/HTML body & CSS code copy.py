<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CesiumJS Viewer - Harris Falcon II Military Radio</title>
    <script src="https://cesium.com/downloads/cesiumjs/releases/latest/Build/Cesium/Cesium.js"></script>
    <link href="https://cesium.com/downloads/cesiumjs/releases/latest/Build/Cesium/Widgets/widgets.css" rel="stylesheet">
    <style>
        html, body, #cesiumContainer {
            width: 100%;
            height: 100%;
            margin: 0;
            padding: 0;
            overflow: hidden;
            font-family: Arial, sans-serif;
        }
        /* Optional: Add a loading spinner */
        #loading {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            font-size: 20px;
            color: white;
            z-index: 1000;
        }
    </style>
</head>
<body>
    <div id="cesiumContainer"></div>
    <div id="loading">Loading...</div>

    <script>
        // Grant CesiumJS access to your Ion assets
        Cesium.Ion.defaultAccessToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI0MzhlNTM0My05MzMxLTQ5OTEtOTMwMi1lMGY1YjNiMjQ4M2UiLCJpZCI6Mjc0NTYxLCJpYXQiOjE3MzkwOTU3OTV9.BKogj6YTsvY_FY-sTeFZ2cpPmhTnFzwG_77stoznb1s";

        // Initialize the Cesium Viewer with additional options for better presentation
        const viewer = new Cesium.Viewer("cesiumContainer", {
            terrainProvider: Cesium.CesiumWorldTerrain, // Enable realistic terrain
            skyBox: false, // Disable skybox for a cleaner look
            baseLayerPicker: false, // Disable base layer picker
            animation: false, // Disable animation widget
            timeline: false, // Disable timeline
            fullscreenButton: false, // Disable fullscreen button
            vrButton: false, // Disable VR button
            geocoder: false, // Disable geocoder
            homeButton: false, // Disable home button
            sceneModePicker: false, // Disable scene mode picker
            navigationHelpButton: false, // Disable navigation help button
            infoBox: false, // Disable info box
            selectionIndicator: false, // Disable selection indicator
        });

        // Ensure models align with terrain
        viewer.scene.globe.depthTestAgainstTerrain = true;

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
                console.error("Error loading tileset:", error);
            } finally {
                // Hide loading spinner once the tileset is loaded
                document.getElementById("loading").style.display = "none";
            }
        })();

        // Optional: Add signal coverage visualization
        viewer.entities.add({
            name: "Signal Coverage",
            position: Cesium.Cartesian3.fromDegrees(-74.0060, 40.7128, -19.6077993848),
            cylinder: {
                length: 500, // Signal range
                topRadius: 0,
                bottomRadius: 200, // Signal radius
                material: Cesium.Color.GREEN.withAlpha(0.5),
            },
        });

        // Optional: Add a simple UI overlay for better presentation
        const overlay = document.createElement("div");
        overlay.style.position = "absolute";
        overlay.style.top = "10px";
        overlay.style.left = "10px";
        overlay.style.backgroundColor = "rgba(0, 0, 0, 0.7)";
        overlay.style.color = "white";
        overlay.style.padding = "10px";
        overlay.style.borderRadius = "5px";
        overlay.style.zIndex = "1000";
        overlay.innerHTML = `
            <h2>Harris Falcon II Military Radio</h2>
            <p>Signal coverage visualized in green.</p>
        `;
        document.body.appendChild(overlay);
    </script>
</body>
</html>