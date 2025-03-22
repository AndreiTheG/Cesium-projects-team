document.addEventListener('DOMContentLoaded', () => {
    fetch('config.json')
        .then(response => response.json())
        .then(config => {
            Cesium.Ion.defaultAccessToken = config.cesiumIonToken;
            console.log('Config loaded:', config);

            Cesium.createWorldTerrainAsync()
                .then(terrainProvider => {
                    console.log('Terrain provider loaded:', terrainProvider);

                    const viewer = new Cesium.Viewer('cesiumContainer', {
                        terrainProvider: terrainProvider,
                        scene3DOnly: true,
                        shadows: false,
                        fog: false,
                        skyAtmosphere: false,
                        timeline: true,
                        animation: true,
                        sceneMode: Cesium.SceneMode.SCENE3D,
                        infoBox: false,
                        selectionIndicator: false,
                        baseLayer: Cesium.ImageryLayer.fromProviderAsync(Cesium.IonImageryProvider.fromAssetId(2)),
                    });

                    console.log('Viewer initialized:', viewer, 'Cesium Version:', Cesium.VERSION);
                    viewer.scene.globe.enableLighting = false;

                    Cesium.createOsmBuildingsAsync()
                        .then(buildings => {
                            viewer.scene.primitives.add(buildings);
                            console.log('OSM buildings added');
                        })
                        .catch(error => console.error('Error loading OSM buildings:', error));

                    viewer.camera.setView({
                        destination: Cesium.Cartesian3.fromDegrees(-123.0744619, 44.0503706, 5000),
                        orientation: {
                            heading: Cesium.Math.toRadians(135),
                            pitch: Cesium.Math.toRadians(-45),
                        }
                    });

                    const startTime = Cesium.JulianDate.now();
                    viewer.clock.startTime = startTime.clone();
                    viewer.clock.currentTime = startTime.clone();
                    viewer.clock.shouldAnimate = true;
                    viewer.clock.multiplier = 1.0;
                    viewer.timeline.zoomTo(startTime, Cesium.JulianDate.addSeconds(startTime, 3600, new Cesium.JulianDate()));

                    const sensorParameters = {
                        Ultrasonic: { range: 100, fov: 30, color: '#00ff00' },
                        Radar: { range: 200, fov: 45, color: '#ff0000' },
                        LiDAR: { range: 150, fov: 20, color: '#0000ff' },
                        Infrared: { range: 50, fov: 25, color: '#ff00ff' },
                        WiFi: { range: 100, fov: 360, color: '#ffff00' },
                        Bluetooth: { range: 10, fov: 360, color: '#00ffff' },
                        Proximity: { range: 5, fov: 30, color: '#ff8000' },
                        Sound: { range: 50, fov: 180, color: '#8000ff' },
                    };

                    const assetIds = {
                        FighterPlan: config.assetIds?.FighterPlan,
                        Rocket: config.assetIds?.Rocket,
                        Satelite: config.assetIds?.Satelite,
                        PSLV_C40: config.assetIds?.PSLV_C40,
                        AGMS: config.assetIds?.AGMS
                    };

                    let selectedEntity = null;
                    let dragging = false;
                    let selectedModel = null;
                    let initialPosition = null;

                    // Define Model Control Panel and Functions First with Updated Colors
                    const modelControls = document.createElement('div');
                    modelControls.id = 'modelControls';
                    modelControls.style.cssText = `
                        position: absolute;
                        top: 450px;
                        left: 10px;
                        background: rgba(13, 27, 42, 0.9);
                        color: #e0e1dd;
                        padding: 20px;
                        border-radius: 8px;
                        border: 2px solid #00ffcc;
                        box-shadow: 0 0 15px rgba(0, 255, 204, 0.5);
                        font-family: 'Arial', sans-serif;
                        display: none;
                        width: 250px;
                        z-index: 1000;
                        transition: all 0.3s ease;
                    `;
                    modelControls.innerHTML = `
                        <h3 style="margin: 0 0 15px; font-size: 16px; color: #00ffcc; text-align: center; text-transform: uppercase;">Model Positioning</h3>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 15px;">
                            <button id="moveLeft" style="background: #1b263b; border: 1px solid #00ffcc; padding: 8px; border-radius: 4px; cursor: pointer; color: #00ffcc; transition: all 0.3s ease;">Left (-90°)</button>
                            <button id="moveRight" style="background: #1b263b; border: 1px solid #00ffcc; padding: 8px; border-radius: 4px; cursor: pointer; color: #00ffcc; transition: all 0.3s ease;">Right (+90°)</button>
                            <button id="moveUp" style="background: #1b263b; border: 1px solid #00ffcc; padding: 8px; border-radius: 4px; cursor: pointer; color: #00ffcc; transition: all 0.3s ease;">Up (+90°)</button>
                            <button id="moveDown" style="background: #1b263b; border: 1px solid #00ffcc; padding: 8px; border-radius: 4px; cursor: pointer; color: #00ffcc; transition: all 0.3s ease;">Down (-90°)</button>
                            <button id="moveFront" style="background: #1b263b; border: 1px solid #00ffcc; padding: 8px; border-radius: 4px; cursor: pointer; color: #00ffcc; transition: all 0.3s ease;">Front (+90m)</button>
                            <button id="moveBack" style="background: #1b263b; border: 1px solid #00ffcc; padding: 8px; border-radius: 4px; cursor: pointer; color: #00ffcc; transition: all 0.3s ease;">Back (-90m)</button>
                        </div>
                        <button id="resetModel" style="background: #1b263b; border: 1px solid #00ffcc; padding: 8px; border-radius: 4px; cursor: pointer; width: 100%; font-size: 14px; color: #00ffcc; transition: all 0.3s ease;">Reset Position</button>
                    `;
                    document.body.appendChild(modelControls);

                    const updateModelControls = () => {
                        modelControls.style.display = selectedModel ? 'block' : 'none';
                    };

                    const updateModelPosition = (direction) => {
                        if (!selectedModel) return;
                        const cartographic = Cesium.Cartographic.fromCartesian(selectedModel.position);
                        let longitude = Cesium.Math.toDegrees(cartographic.longitude);
                        let latitude = Cesium.Math.toDegrees(cartographic.latitude);
                        let height = cartographic.height;

                        switch (direction) {
                            case 'left':
                                longitude -= 90;
                                break;
                            case 'right':
                                longitude += 90;
                                break;
                            case 'up':
                                latitude += 90;
                                break;
                            case 'down':
                                latitude -= 90;
                                break;
                            case 'front':
                                height += 90;
                                break;
                            case 'back':
                                height -= 90;
                                break;
                        }

                        latitude = Math.max(-90, Math.min(90, latitude));
                        longitude = ((longitude + 180) % 360 + 360) % 360 - 180;

                        selectedModel.position = Cesium.Cartesian3.fromDegrees(longitude, latitude, height);
                        const newMatrix = Cesium.Transforms.eastNorthUpToFixedFrame(selectedModel.position);
                        Cesium.Matrix4.setRotation(newMatrix, Cesium.Matrix3.fromHeadingPitchRoll(new Cesium.HeadingPitchRoll(selectedModel.heading, 0, 0)));
                        selectedModel.primitive.modelMatrix = newMatrix;

                        console.log(`Model moved ${direction} to:`, { longitude, latitude, height });
                    };

                    const resetModelPosition = () => {
                        if (!selectedModel) return;
                        selectedModel.position = Cesium.Cartesian3.clone(initialPosition);
                        selectedModel.heading = 0;
                        const newMatrix = Cesium.Transforms.eastNorthUpToFixedFrame(selectedModel.position);
                        Cesium.Matrix4.setRotation(newMatrix, Cesium.Matrix3.fromHeadingPitchRoll(new Cesium.HeadingPitchRoll(0, 0, 0)));
                        selectedModel.primitive.modelMatrix = newMatrix;
                        console.log('Model reset to initial position');
                    };

                    document.getElementById('moveLeft').addEventListener('click', () => updateModelPosition('left'));
                    document.getElementById('moveRight').addEventListener('click', () => updateModelPosition('right'));
                    document.getElementById('moveUp').addEventListener('click', () => updateModelPosition('up'));
                    document.getElementById('moveDown').addEventListener('click', () => updateModelPosition('down'));
                    document.getElementById('moveFront').addEventListener('click', () => updateModelPosition('front'));
                    document.getElementById('moveBack').addEventListener('click', () => updateModelPosition('back'));
                    document.getElementById('resetModel').addEventListener('click', resetModelPosition);

                    // Model Launch Function
                    async function loadModel(modelName, assetId, dropPosition = null) {
                        try {
                            if (!assetId) {
                                throw new Error(`Asset ID for ${modelName} is undefined. Please define it in config.json.`);
                            }
                            console.log(`Launching ${modelName} model with asset ID: ${assetId}`);
                            const resource = await Cesium.IonResource.fromAssetId(assetId, {
                                accessToken: Cesium.Ion.defaultAccessToken
                            });
                            console.log(`Resource URL for ${modelName} (ID ${assetId}): ${resource.url}`);

                            const position = dropPosition || Cesium.Cartesian3.fromDegrees(-74.0060, 40.7128, 100);
                            initialPosition = Cesium.Cartesian3.clone(position);
                            const cartographic = Cesium.Cartographic.fromCartesian(position);
                            const longitude = Cesium.Math.toDegrees(cartographic.longitude);
                            const latitude = Cesium.Math.toDegrees(cartographic.latitude);
                            const height = cartographic.height;

                            let model;
                            try {
                                model = await Cesium.Model.fromGltfAsync({
                                    url: resource,
                                    modelMatrix: Cesium.Transforms.eastNorthUpToFixedFrame(position),
                                    scale: 100.0
                                });
                            } catch (loadError) {
                                throw new Error(`Failed to load model ${modelName}: ${loadError.message}`);
                            }

                            if (!model) {
                                throw new Error(`Model ${modelName} loaded but returned undefined`);
                            }

                            const modelPrimitive = viewer.scene.primitives.add(model);
                            console.log(`${modelName} model loaded at:`, { longitude, latitude, height });

                            selectedModel = { primitive: modelPrimitive, position: position, heading: 0 };
                            updateModelControls();

                            const debugSphere = viewer.scene.primitives.add(
                                new Cesium.Primitive({
                                    geometryInstances: new Cesium.GeometryInstance({
                                        geometry: new Cesium.SphereGeometry({
                                            radius: 20.0,
                                            vertexFormat: Cesium.VertexFormat.POSITION_AND_NORMAL
                                        }),
                                        modelMatrix: Cesium.Transforms.eastNorthUpToFixedFrame(position)
                                    }),
                                    appearance: new Cesium.MaterialAppearance({
                                        material: Cesium.Material.fromType('Color', {
                                            color: Cesium.Color.RED
                                        })
                                    })
                                })
                            );

                            viewer.camera.flyTo({
                                destination: Cesium.Cartesian3.fromDegrees(longitude, latitude, 1000),
                                orientation: {
                                    heading: Cesium.Math.toRadians(0),
                                    pitch: Cesium.Math.toRadians(-45),
                                },
                                duration: 2
                            });

                            if (model.readyPromise && typeof model.readyPromise.then === 'function') {
                                model.readyPromise.then(() => {
                                    console.log(`${modelName} model is ready`);
                                }).catch((error) => {
                                    console.error(`${modelName} model failed to become ready:`, error);
                                });
                            } else {
                                console.log(`${modelName} model loaded but no valid readyPromise available`);
                            }
                        } catch (error) {
                            console.error(`Error loading ${modelName}:`, error);
                            document.getElementById('errorMessage').textContent = `Failed to load ${modelName}: ${error.message || 'Unknown error'}`;
                        }
                    }

                    // Drag-and-Drop Handling for Sensors
                    document.querySelectorAll('.draggable').forEach(item => {
                        item.addEventListener('dragstart', (e) => {
                            e.dataTransfer.setData('text', e.target.id);
                        });
                    });

                    viewer.canvas.addEventListener('dragover', (e) => e.preventDefault());

                    viewer.canvas.addEventListener('drop', (e) => {
                        e.preventDefault();
                        const id = e.dataTransfer.getData('text');
                        const position = viewer.scene.pickPosition(new Cesium.Cartesian2(e.clientX, e.clientY));
                        if (!position) return;

                        const cartographic = Cesium.Cartographic.fromCartesian(position);
                        const longitude = Cesium.Math.toDegrees(cartographic.longitude);
                        const latitude = Cesium.Math.toDegrees(cartographic.latitude);
                        const height = cartographic.height;

                        if (sensorParameters[id]) {
                            const params = sensorParameters[id];
                            const entity = viewer.entities.add({
                                position: Cesium.Cartesian3.fromDegrees(longitude, latitude, height + 5),
                                cylinder: {
                                    length: params.range,
                                    topRadius: 0,
                                    bottomRadius: params.range * Math.tan(Cesium.Math.toRadians(params.fov / 2)),
                                    material: Cesium.Color.fromCssColorString(params.color).withAlpha(0.5)
                                }
                            });
                            entity.type = 'sensor';
                            entity.name = id;
                            animateEntityPlacement(entity);
                            updateSensorInfo(entity);
                            populateParameterControls(entity);
                        } else if (Object.keys(assetIds).includes(id)) {
                            loadModel(id, assetIds[id], position);
                        }
                    });

                    // Model Launch Button
                    document.getElementById('launchModelButton').addEventListener('click', () => {
                        const modelSelect = document.getElementById('modelSelect');
                        const selectedModel = modelSelect.value;
                        console.log(`Launching ${selectedModel} model`);
                        loadModel(selectedModel, assetIds[selectedModel]);
                    });

                    function animateEntityPlacement(entity) {
                        const startPosition = entity.position.getValue(viewer.clock.currentTime);
                        if (!startPosition) return;
                        entity.position = new Cesium.SampledPositionProperty();
                        entity.position.addSample(viewer.clock.currentTime, Cesium.Cartesian3.fromElements(startPosition.x, startPosition.y, startPosition.z + 100));
                        entity.position.addSample(Cesium.JulianDate.addSeconds(viewer.clock.currentTime, 1, new Cesium.JulianDate()), startPosition);
                        viewer.clock.shouldAnimate = true;
                    }

                    viewer.scene.screenSpaceCameraController.enableInputs = true;
                    let moveHandler = new Cesium.ScreenSpaceEventHandler(viewer.canvas);
                    moveHandler.setInputAction((movement) => {
                        const picked = viewer.scene.pick(movement.position);
                        if (picked && picked.id) {
                            selectedEntity = picked.id;
                            dragging = true;
                            viewer.scene.screenSpaceCameraController.enableInputs = false;
                            showTooltip(movement.position, 'Drag to Move Sensor');
                        }
                    }, Cesium.ScreenSpaceEventType.LEFT_DOWN);

                    moveHandler.setInputAction((movement) => {
                        if (dragging && selectedEntity) {
                            const position = viewer.scene.pickPosition(movement.endPosition);
                            if (position) {
                                selectedEntity.position = new Cesium.ConstantPositionProperty(position);
                                updateTooltip(movement.endPosition);
                            }
                        }
                    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

                    moveHandler.setInputAction(() => {
                        dragging = false;
                        selectedEntity = null;
                        viewer.scene.screenSpaceCameraController.enableInputs = true;
                        hideTooltip();
                    }, Cesium.ScreenSpaceEventType.LEFT_UP);

                    const tooltip = document.createElement('div');
                    tooltip.className = 'tooltip';
                    document.body.appendChild(tooltip);

                    function showTooltip(position, text) {
                        tooltip.style.display = 'block';
                        tooltip.style.left = `${position.x + 10}px`;
                        tooltip.style.top = `${position.y - 10}px`;
                        tooltip.textContent = text;
                    }

                    function updateTooltip(position) {
                        tooltip.style.left = `${position.x + 10}px`;
                        tooltip.style.top = `${position.y - 10}px`;
                    }

                    function hideTooltip() {
                        tooltip.style.display = 'none';
                    }

                    function updateSensorInfo(entity) {
                        if (entity.type === 'sensor') {
                            const params = sensorParameters[entity.name];
                            document.getElementById('sensorInfo').innerHTML = `
                                Name: ${entity.name}<br>
                                Range: ${params.range} m<br>
                                FOV: ${params.fov}°<br>
                                Color: ${params.color}
                            `;
                        }
                    }

                    function populateParameterControls(entity) {
                        if (entity.type !== 'sensor') return;
                        const params = sensorParameters[entity.name];
                        const controls = document.getElementById('parameterControls');
                        controls.innerHTML = `
                            <label style="color: #00ffcc;">Range: <input type="range" id="rangeSlider" min="10" max="500" value="${params.range}"></label><br>
                            <label style="color: #00ffcc;">FOV: <input type="range" id="fovSlider" min="10" max="360" value="${params.fov}"></label><br>
                            <label style="color: #00ffcc;">Color: <input type="text" id="colorPicker"></label>
                        `;

                        $('#colorPicker').spectrum({
                            color: params.color,
                            showInput: true,
                            preferredFormat: "hex",
                            change: (color) => {
                                params.color = color.toHexString();
                                entity.cylinder.material = Cesium.Color.fromCssColorString(params.color).withAlpha(0.5);
                                updateSensorInfo(entity);
                            }
                        });

                        document.getElementById('rangeSlider').addEventListener('input', (e) => {
                            params.range = parseInt(e.target.value);
                            entity.cylinder.length = params.range;
                            entity.cylinder.bottomRadius = params.range * Math.tan(Cesium.Math.toRadians(params.fov / 2));
                            updateSensorInfo(entity);
                        });

                        document.getElementById('fovSlider').addEventListener('input', (e) => {
                            params.fov = parseInt(e.target.value);
                            entity.cylinder.bottomRadius = params.range * Math.tan(Cesium.Math.toRadians(params.fov / 2));
                            updateSensorInfo(entity);
                        });
                    }

                    document.getElementById('playButton').addEventListener('click', () => viewer.clock.shouldAnimate = true);
                    document.getElementById('pauseButton').addEventListener('click', () => viewer.clock.shouldAnimate = false);
                    document.getElementById('resetButton').addEventListener('click', () => {
                        viewer.clock.currentTime = viewer.clock.startTime.clone();
                        viewer.clock.shouldAnimate = false;
                    });
                    document.getElementById('clearButton').addEventListener('click', () => {
                        viewer.entities.removeAll();
                        document.getElementById('sensorInfo').textContent = 'Select a sensor to see details.';
                        document.getElementById('parameterControls').innerHTML = '';
                        selectedModel = null;
                        updateModelControls();
                    });

                    document.getElementById('flyToButton').addEventListener('click', () => {
                        const lat = parseFloat(document.getElementById('lat').value);
                        const lon = parseFloat(document.getElementById('lon').value);
                        const errorMessage = document.getElementById('errorMessage');

                        if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
                            errorMessage.textContent = 'Invalid latitude or longitude!';
                            return;
                        }

                        errorMessage.textContent = '';
                        viewer.camera.flyTo({
                            destination: Cesium.Cartesian3.fromDegrees(lon, lat, 10000),
                            duration: 2,
                            orientation: {
                                heading: Cesium.Math.toRadians(0),
                                pitch: Cesium.Math.toRadians(-45),
                            }
                        });
                    });

                    const meterDisplay = document.getElementById('meter');
                    function updateMeter() {
                        const cartographic = viewer.camera.positionCartographic;
                        if (cartographic) {
                            const altitude = Math.round(cartographic.height);
                            meterDisplay.textContent = `Altitude: ${altitude} m`;
                        }
                    }

                    if (viewer.scene && viewer.scene.postUpdate) {
                        viewer.scene.postUpdate.addEventListener(updateMeter);
                        updateMeter();
                    } else {
                        console.error('viewer.scene.postUpdate is not available');
                    }
                })
                .catch(error => {
                    console.error('Error loading terrain provider:', error);
                    document.getElementById('errorMessage').textContent = `Terrain loading failed: ${error.message}`;
                });
        })
        .catch(error => {
            console.error('Error loading config:', error);
            document.getElementById('errorMessage').textContent = `Config loading failed: ${error.message}`;
        });
});