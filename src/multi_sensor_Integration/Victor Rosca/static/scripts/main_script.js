// Replace with your own Cesium Ion access token
Cesium.Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJlNmQzM2IzYy1iNmZmLTQzOTAtODI5NC00MzE2MzY1MTdmOGQiLCJpZCI6MjQxODYyLCJpYXQiOjE3MjY0NTk1MjJ9.XhN4UNgKITt-KoENllwyeEe5CCfcr5QZ1L90ToHUt14';
//#############################################################################################
// THIS IS WHERE WE LOAD THE ENVIRONMENT FROM CESIUM

// Initialize the Cesium Viewer
const viewer = new Cesium.Viewer('cesiumContainer', {
  terrain: Cesium.Terrain.fromWorldTerrain(),
  animation: true,
  timeline: true,
  shouldAnimate: true,
  infoBox: false, // Disable default info box
  selectionIndicator: false, // Disable default selection indicator
  shadows: true, // Enable shadows for a realistic effect
});

// Enable high dynamic range (HDR)
viewer.scene.highDynamicRange = true;
// Enable globe lighting
viewer.scene.globe.enableLighting = true;
// Add shadows
viewer.shadows = true;
viewer.scene.shadowMap.maximumDistance = 10000;
viewer.scene.shadowMap.size = 2048;
// Add atmospheric effects
viewer.scene.fog.enabled = true;
viewer.scene.skyAtmosphere.hueShift = 0.0;
viewer.scene.skyAtmosphere.saturationShift = 0.0;
viewer.scene.skyAtmosphere.brightnessShift = 0.0;

// Load 3D buildings
Cesium.createOsmBuildingsAsync().then(function(buildingTileset) {
  viewer.scene.primitives.add(buildingTileset);
  // Optionally hide a loading overlay if you have one
  // document.getElementById('loadingOverlay').style.display = 'none';
}).catch(function(error){
  console.error('Error loading buildings:', error);
});

// Set initial camera position (New York City)
const startLongitude = -74.0060;
const startLatitude = 40.7128;
const eyeHeight = 500; //
// Elevated view to see the city

viewer.camera.setView({
  destination: Cesium.Cartesian3.fromDegrees(startLongitude, startLatitude, eyeHeight),
  orientation: {
    heading: Cesium.Math.toRadians(0.0),
    pitch: Cesium.Math.toRadians(-45.0),
    roll: 0.0
  }
});

// Enable depth testing against terrain
viewer.scene.globe.depthTestAgainstTerrain = true;

// Time settings
const start = Cesium.JulianDate.fromDate(new Date());
const stop = Cesium.JulianDate.addSeconds(start, 3600, new Cesium.JulianDate());

viewer.clock.startTime = start.clone();
viewer.clock.stopTime = stop.clone();
viewer.clock.currentTime = start.clone();
viewer.clock.clockRange = Cesium.ClockRange.LOOP_STOP;
viewer.clock.multiplier = 60;
viewer.clock.shouldAnimate = false;

viewer.timeline.zoomTo(start, stop);



let selectedEntity = null;
let baseOrientation = null;
let isDragging = false;
let downPosition = null;

// Funcție utilitară pentru a obține poziția pe glob din evenimentul mouse
function getMousePosition(event) {
  const ray = viewer.camera.getPickRay(event.position);
  if (!ray) return null;
  return viewer.scene.globe.pick(ray, viewer.scene);
}

function createFlatOrientation(position) {
  // Obținem matricea de transformare locală
  const enuToEcef = Cesium.Transforms.eastNorthUpToFixedFrame(position);
  
  // Vom folosi o abordare diferită pentru a asigura verticalizarea completă
  
  // 1. Obținem normala la suprafața Pământului la poziția dată
  const normal = Cesium.Cartesian3.normalize(position, new Cesium.Cartesian3());
  
  // 2. Vom folosi această normală ca axa Z a noului sistem de coordonate
  const zAxis = normal;
  
  // 3. Pentru axa X, vom folosi o direcție perpendiculară pe axa Z orientată spre est
  // Mai întâi, alegem un vector arbitrar care nu este paralel cu normala
  let arbitraryVector;
  if (Math.abs(normal.z) < 0.9) {
    arbitraryVector = Cesium.Cartesian3.UNIT_Z;
  } else {
    arbitraryVector = Cesium.Cartesian3.UNIT_X;
  }
  
  // Calculăm un vector perpendicular pe normală (va fi în planul tangent la suprafață)
  const xAxis = Cesium.Cartesian3.cross(normal, arbitraryVector, new Cesium.Cartesian3());
  Cesium.Cartesian3.normalize(xAxis, xAxis);
  
  // 4. Calculăm axa Y folosind produsul vectorial Z × X
  const yAxis = Cesium.Cartesian3.cross(zAxis, xAxis, new Cesium.Cartesian3());
  Cesium.Cartesian3.normalize(yAxis, yAxis);
  
  // 5. Construim matricea de rotație folosind cele trei axe ortogonale
  const rotation = new Cesium.Matrix3(
    xAxis.x, yAxis.x, zAxis.x,
    xAxis.y, yAxis.y, zAxis.y,
    xAxis.z, yAxis.z, zAxis.z
  );
  
  // 6. Convertim matricea de rotație în quaternion
  return Cesium.Quaternion.fromRotationMatrix(rotation);
}




function calculateLocalOrientation(position) {
  // Obținem transformarea locală la poziția dată
  const enuToEcef = Cesium.Transforms.eastNorthUpToFixedFrame(position);
  
  // Extragem rotația din matricea de transformare
  const rotation = new Cesium.Matrix3();
  Cesium.Matrix4.getRotation(enuToEcef, rotation);
  
  // Convertim matricea de rotație în quaternion
  const localOrientation = Cesium.Quaternion.fromRotationMatrix(rotation);
  
  // Aplicăm o corecție pentru a anula înclinarea axială a Pământului
  const correction = Cesium.Quaternion.fromAxisAngle(
    Cesium.Cartesian3.UNIT_X, 
    Cesium.Math.toRadians(-23.5) // Corectarea înclinației axiale a Pământului
  );
  
  // Combinăm orientarea locală cu corecția
  return Cesium.Quaternion.multiply(
    localOrientation,
    correction,
    new Cesium.Quaternion()
  );
}

// --- Evenimentul de LEFT_DOWN pentru selectare ---
function anySensorAnimated() {
  return sensorEntities.some(entity => entity.isAnimated);
}

viewer.screenSpaceEventHandler.setInputAction((event) => {
  downPosition = event.position;
  const pickedObject = viewer.scene.pick(event.position);

  if (Cesium.defined(pickedObject) && Cesium.defined(pickedObject.id)) {
    // Check if we're selecting an entity that's already animated
    if (pickedObject.id.isAnimated) {
      // Just update the selected entity but don't modify its orientation
      selectedEntity = pickedObject.id;
      
      // Update sliders with current rotation values
      rotationXSlider.value = selectedEntity.rotationX || 0;
      rotationYSlider.value = selectedEntity.rotationY || 0;
      rotationZSlider.value = selectedEntity.rotationZ || 0;
      rotationXValue.innerText = (selectedEntity.rotationX || 0) + '°';
      rotationYValue.innerText = (selectedEntity.rotationY || 0) + '°';
      rotationZValue.innerText = (selectedEntity.rotationZ || 0) + '°';
      
      // Enable sliders even while animation is running
      rotationXSlider.disabled = false;
      rotationYSlider.disabled = false;
      rotationZSlider.disabled = false;
      
      return; // Exit early - don't mess with the animation callback
    }
    
    // Rest of your existing selection code for non-animated entities
    selectedEntity = pickedObject.id;
    
    // Avertizează dacă entitatea folosește modelMatrix
    if (selectedEntity.modelMatrix) {
      console.warn('Entitatea folosește modelMatrix. Ajustările rotației prin slider-uri nu vor funcționa.');
    }
    
    // Inițializare proprietăți de rotație personalizate, dacă nu sunt deja definite
    if (typeof selectedEntity.rotationX === 'undefined') {
      selectedEntity.rotationX = 0;
      selectedEntity.rotationY = 0;
      selectedEntity.rotationZ = 0;
    }
    
    // Asigură-te că proprietatea orientation este definită - FOARTE IMPORTANT
    // We don't need to change the orientation if it's already been set properly
    if (!selectedEntity.hasBeenSelectedBefore) {
      if (selectedEntity.sensorParam && selectedEntity.sensorParam.type === 'sphere') {
        // Este prima selectare, aplicăm orientarea verticală corectată
        const position = selectedEntity.position.getValue(viewer.clock.currentTime);
        const flatOrientation = createFlatOrientation(position);
        
        selectedEntity.orientation = new Cesium.ConstantProperty(flatOrientation);
        selectedEntity.initialOrientation = flatOrientation.clone();
        selectedEntity.baseOrientation = flatOrientation.clone();
        
        // Marcăm că entitatea a fost selectată pentru a nu reseta orientarea data viitoare
        selectedEntity.hasBeenSelectedBefore = true;
      } else if (!selectedEntity.orientation) {
        // Pentru alte entități, comportamentul normal
        selectedEntity.orientation = new Cesium.ConstantProperty(Cesium.Quaternion.IDENTITY.clone());
        
        if (!selectedEntity.initialOrientation) {
          selectedEntity.initialOrientation = Cesium.Quaternion.IDENTITY.clone();
        }
        if (!selectedEntity.baseOrientation) {
          selectedEntity.baseOrientation = selectedEntity.initialOrientation.clone();
        }
        
        selectedEntity.hasBeenSelectedBefore = true;
      }
    }
    
    // Actualizare valorile slider-elor și afișarea lor
    rotationXSlider.value = selectedEntity.rotationX;
    rotationYSlider.value = selectedEntity.rotationY;
    rotationZSlider.value = selectedEntity.rotationZ;
    rotationXValue.innerText = selectedEntity.rotationX + '°';
    rotationYValue.innerText = selectedEntity.rotationY + '°';
    rotationZValue.innerText = selectedEntity.rotationZ + '°';
    
    // Activează slider-ele dacă erau dezactivate
    rotationXSlider.disabled = false;
    rotationYSlider.disabled = false;
    rotationZSlider.disabled = false;
  } else {
    // No entity was picked
    // Keep the selected entity if it's animated
    if (selectedEntity && selectedEntity.isAnimated) {
      return;
    }
    
    selectedEntity = null;
    
    // Resetare și dezactivare slider-e
    rotationXSlider.disabled = true;
    rotationYSlider.disabled = true;
    rotationZSlider.disabled = true;
    rotationXSlider.value = 0;
    rotationYSlider.value = 0;
    rotationZSlider.value = 0;
    rotationXValue.innerText = '0°';
    rotationYValue.innerText = '0°';
    rotationZValue.innerText = '0°';
  }
  isDragging = false;
}, Cesium.ScreenSpaceEventType.LEFT_DOWN);

// --- Evenimentul de MOUSE_MOVE pentru a gestiona dragging-ul ---
viewer.screenSpaceEventHandler.setInputAction((event) => {
  if (!selectedEntity) return;
  
  // Dacă nu am început încă dragging-ul, verificăm dacă mișcarea depășește un prag
  if (!isDragging) {
    const dx = event.position.x - downPosition.x;
    const dy = event.position.y - downPosition.y;
    if (Math.sqrt(dx * dx + dy * dy) > 5) { // prag de 5 pixeli
      isDragging = true;
    }
  }
  
  // Dacă se face efectiv dragging, actualizăm poziția obiectului
  if (isDragging) {
    const newPosition = getMousePosition(event);
    if (newPosition) {
      selectedEntity.position = newPosition;
      
      // Actualizăm orientarea pentru a elimina înclinarea axială la noua poziție
      if (selectedEntity.sensorParam && selectedEntity.sensorParam.type === 'sphere' && !selectedEntity.isAnimated) {
        const flatOrientation = createFlatOrientation(newPosition);
        
        // Păstrăm rotațiile aplicate manual
        if (selectedEntity.rotationX !== 0 || selectedEntity.rotationY !== 0 || selectedEntity.rotationZ !== 0) {
          // Salvăm noua orientare verticală ca punct de plecare
          selectedEntity.initialOrientation = flatOrientation.clone();
          // Apoi aplicăm rotațiile existente peste aceasta
          updateRotation();
        } else {
          // Setăm direct orientarea verticală
          selectedEntity.orientation = new Cesium.ConstantProperty(flatOrientation);
          selectedEntity.initialOrientation = flatOrientation.clone();
          selectedEntity.baseOrientation = flatOrientation.clone();
        }
      }
    }
  }
}, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

// --- Evenimentul de LEFT_UP pentru a încheia dragging-ul ---
viewer.screenSpaceEventHandler.setInputAction((event) => {
  isDragging = false;
  downPosition = null;
  // Nu resetăm selectedEntity, astfel încât rotația să poată fi aplicată ulterior
}, Cesium.ScreenSpaceEventType.LEFT_UP);


// --- Controlul pentru rotație prin slider-uri ---
const rotationXSlider = document.getElementById('rotationXSlider');
const rotationYSlider = document.getElementById('rotationYSlider');
const rotationZSlider = document.getElementById('rotationZSlider');

const rotationXValue = document.getElementById('rotationXValue');
const rotationYValue = document.getElementById('rotationYValue');
const rotationZValue = document.getElementById('rotationZValue');

// Funcția care actualizează rotația obiectului selectat
function updateRotation() {
  if (!selectedEntity) return;
  
  const xAngle = Cesium.Math.toRadians(parseFloat(selectedEntity.rotationX || 0));
  const yAngle = Cesium.Math.toRadians(parseFloat(selectedEntity.rotationY || 0));
  const zAngle = Cesium.Math.toRadians(parseFloat(selectedEntity.rotationZ || 0));

  const qx = Cesium.Quaternion.fromAxisAngle(Cesium.Cartesian3.UNIT_X, xAngle);
  const qy = Cesium.Quaternion.fromAxisAngle(Cesium.Cartesian3.UNIT_Y, yAngle);
  const qz = Cesium.Quaternion.fromAxisAngle(Cesium.Cartesian3.UNIT_Z, zAngle);
  
  // Offset-ul manual calculat din valorile slider-elor
  const manualOffset = Cesium.Quaternion.multiply(
    qz,
    Cesium.Quaternion.multiply(qy, qx, new Cesium.Quaternion()),
    new Cesium.Quaternion()
  );

  // Folosim orientarea inițială ca punct de plecare
  const newOrientation = Cesium.Quaternion.multiply(
    selectedEntity.initialOrientation,
    manualOffset,
    new Cesium.Quaternion()
  );
  
  // Salvăm orientarea de bază care include rotațiile
  selectedEntity.baseOrientation = newOrientation.clone();

  // Dacă obiectul nu este animat, actualizăm direct orientarea
  if (!selectedEntity.isAnimated) {
    selectedEntity.orientation = new Cesium.ConstantProperty(newOrientation);
  }
}

// --- Actualizează ascultătorii slider-eilor pentru a salva valorile în entitate ---
rotationXSlider.addEventListener('input', function() {
  rotationXValue.innerText = this.value + '°';
  if (selectedEntity) {
    selectedEntity.rotationX = parseFloat(this.value);
    updateRotation();
  }
});
rotationYSlider.addEventListener('input', function() {
  rotationYValue.innerText = this.value + '°';
  if (selectedEntity) {
    selectedEntity.rotationY = parseFloat(this.value);
    updateRotation();
  }
});
rotationZSlider.addEventListener('input', function() {
  rotationZValue.innerText = this.value + '°';
  if (selectedEntity) {
    selectedEntity.rotationZ = parseFloat(this.value);
    updateRotation();
  }
});

// --- Keyboard Shortcuts: Fine-grained Object Rotation ---
// Folosim tastele săgeți și Q/E pentru a modifica rotația în pași de 1°
document.addEventListener('keydown', function(event) {
  // Aplicăm shortcut-uri doar dacă un obiect este selectat
  if (!selectedEntity) return;

  // Definește pasul de rotație
  const fineStep = 1; // 1° pe apăsare

  // Gestionarea evenimentelor pentru fiecare tastă
  if (event.key === "ArrowUp") {
    // Crește rotația pe axa X
    rotationXSlider.value = parseFloat(rotationXSlider.value) + fineStep;
    rotationXValue.innerText = rotationXSlider.value + '°';
    updateRotation();
    event.preventDefault();
  } else if (event.key === "ArrowDown") {
    // Scade rotația pe axa X
    rotationXSlider.value = parseFloat(rotationXSlider.value) - fineStep;
    rotationXValue.innerText = rotationXSlider.value + '°';
    updateRotation();
    event.preventDefault();
  } else if (event.key === "ArrowRight") {
    // Crește rotația pe axa Y
    rotationYSlider.value = parseFloat(rotationYSlider.value) + fineStep;
    rotationYValue.innerText = rotationYSlider.value + '°';
    updateRotation();
    event.preventDefault();
  } else if (event.key === "ArrowLeft") {
    // Scade rotația pe axa Y
    rotationYSlider.value = parseFloat(rotationYSlider.value) - fineStep;
    rotationYValue.innerText = rotationYSlider.value + '°';
    updateRotation();
    event.preventDefault();
  } else if (event.key.toLowerCase() === "e") {
    // Crește rotația pe axa Z
    rotationZSlider.value = parseFloat(rotationZSlider.value) + fineStep;
    rotationZValue.innerText = rotationZSlider.value + '°';
    updateRotation();
    event.preventDefault();
  } else if (event.key.toLowerCase() === "q") {
    // Scade rotația pe axa Z
    rotationZSlider.value = parseFloat(rotationZSlider.value) - fineStep;
    rotationZValue.innerText = rotationZSlider.value + '°';
    updateRotation();
    event.preventDefault();
  }
});

// --- Display Rotation Angles: Update Information Panel ---
// Asigură-te că ai în HTML un element cu id-ul "rotationInfo"
const rotationInfo = document.getElementById('rotationInfo');

function updateRotationInfo(entity) {
  if (!entity || !entity.orientation) {
      document.getElementById("rotationInfo").innerHTML = "<p>Rotation: N/A</p>";
      return;
  }

  // Obținem quaternion-ul entității
  var orientation = Cesium.Quaternion.clone(entity.orientation.getValue(Cesium.JulianDate.now()));
  var hpr = Cesium.HeadingPitchRoll.fromQuaternion(orientation);

  // Convertim la grade
  var heading = Cesium.Math.toDegrees(hpr.heading).toFixed(2);
  var pitch = Cesium.Math.toDegrees(hpr.pitch).toFixed(2);
  var roll = Cesium.Math.toDegrees(hpr.roll).toFixed(2);

  // Afișăm valorile
  document.getElementById("rotationInfo").innerHTML =
      `<p><strong>Rotation Angles:</strong></p>
      <p>Heading: ${heading}°</p>
      <p>Pitch: ${pitch}°</p>
      <p>Roll: ${roll}°</p>`;
}

// Funcție care se actualizează periodic
function trackEntityRotation(entity) {
  if (!entity) return;

  setInterval(() => {
      updateRotationInfo(entity);
  }, 500); // Actualizare la fiecare 500ms
}

// Exemplu: Apelare când este selectat un senzor sau un obiect

viewer.selectedEntityChanged.addEventListener(function(entity) {
  selectedEntity = entity;
  trackEntityRotation(entity);
});






// ============================
// Animation Control Handlers
// ============================
document.getElementById('animationOnButton').addEventListener('click', function() {
  if (selectedEntity && selectedEntity.sensorParam && 
      (selectedEntity.sensorParam.type === 'sphere' || selectedEntity.sensorParam.type === 'cone')) {
    
    if (selectedEntity.isAnimated) {
      return; // Ieșim dacă animația rulează deja
    }

    viewer.clock.shouldAnimate = true;
    viewer.clock.multiplier = 1;
    const angularSpeed = Cesium.Math.TWO_PI / 10; // 1 rotație/10 secunde

    // Setăm orientarea de bază, dacă nu a fost modificată manual
    if (selectedEntity.rotationX === 0 && selectedEntity.rotationY === 0 && selectedEntity.rotationZ === 0) {
      const position = selectedEntity.position.getValue(viewer.clock.currentTime);
      const flatOrientation = createFlatOrientation(position);
      selectedEntity.baseOrientation = flatOrientation.clone();
    }
    // Altfel, presupunem că selectedEntity.baseOrientation a fost deja setată

    // Marcăm animația ca activă și inițializăm frozenOrientation
    selectedEntity.isAnimated = true;
    selectedEntity.frozenOrientation = selectedEntity.baseOrientation;

    // Callback-ul pentru rotație care actualizează frozenOrientation doar dacă animația este activă
    const currentEntity = selectedEntity;
    currentEntity.orientation = new Cesium.CallbackProperty(function(time, result) {
      if (!currentEntity.isAnimated) {
        return currentEntity.frozenOrientation;
    }
    const seconds = Cesium.JulianDate.secondsDifference(time, viewer.clock.startTime);
    const angle = seconds * angularSpeed;
    currentEntity.frozenOrientation = Cesium.Quaternion.multiply(
      currentEntity.baseOrientation,
      Cesium.Quaternion.fromAxisAngle(Cesium.Cartesian3.UNIT_Z, angle, result),
      result
    );
    return currentEntity.frozenOrientation;
    }, false);
  }
});


// --- Handler-ul pentru oprirea animației ---
document.getElementById('animationOffButton').addEventListener('click', function() {
  if (selectedEntity && selectedEntity.sensorParam &&
      (selectedEntity.sensorParam.type === 'sphere' || selectedEntity.sensorParam.type === 'cone')) {

      // Dezactivăm animația
      selectedEntity.isAnimated = false;
      
      // Înlocuim proprietatea orientation cu una constantă,
      // bazată pe ultima orientare calculată
      const currentOrientation = selectedEntity.frozenOrientation;
      selectedEntity.orientation = new Cesium.ConstantProperty(currentOrientation);
      
      // Pentru conuri, restaurăm proprietățile originale ale cilindrului doar dacă pulsul NU este activ
      if (selectedEntity.sensorParam.type === 'cone' && selectedEntity.originalConeHeight && !selectedEntity.isPulsing) {
        const originalMaterial = selectedEntity.cylinder.material;
        const originalOutline = selectedEntity.cylinder.outline;
        const originalOutlineColor = selectedEntity.cylinder.outlineColor;
        const originalOutlineWidth = selectedEntity.cylinder.outlineWidth;
        const originalSlices = selectedEntity.cylinder.slices || 16;
        const originalVerticalLines = selectedEntity.cylinder.numberOfVerticalLines || 16;
        
        selectedEntity.cylinder = new Cesium.CylinderGraphics({
          length: selectedEntity.originalConeHeight,
          topRadius: 0,
          bottomRadius: selectedEntity.originalConeRadius,
          material: originalMaterial,
          outline: originalOutline,
          outlineColor: originalOutlineColor,
          outlineWidth: originalOutlineWidth,
          slices: originalSlices,
          numberOfVerticalLines: originalVerticalLines
        });
      }
      
      // Re-activăm slider-ele pentru rotație
      rotationXSlider.disabled = false;
      rotationYSlider.disabled = false;
      rotationZSlider.disabled = false;
      
      // Dacă nu mai există entități animate sau pulsante, oprim ceasul.
      // În caz contrar, dacă există cel puțin o entitate în modul de puls, ceasul rămâne activ.
      if (!anySensorAnimated() && !anyEntityPulsing()) {
        viewer.clock.shouldAnimate = false;
      }
  }
});



let lastPulseUpdateTime = null;
let pulseUpdateInterval = 16; // Approximately 60fps

// Completely rewrite the handlePulseWithoutAnimation function to be more precise
function handlePulseWithoutAnimation() {
  // Check if any entity is pulsing
  const isPulsing = viewer.entities.values.some(entity => entity.isPulsing === true);
  
  // Only proceed if we have pulsing entities and animation clock is off
  if (isPulsing && !viewer.clock.shouldAnimate) {
    const now = Date.now();
    
    // Initialize lastPulseUpdateTime if needed
    if (lastPulseUpdateTime === null) {
      lastPulseUpdateTime = now;
    }
    
    // Check if enough time has passed since the last update
    if (now - lastPulseUpdateTime >= pulseUpdateInterval) {
      // Update the time with a fixed delta to ensure consistent speed
      const currentTime = Cesium.JulianDate.addSeconds(
        viewer.clock.currentTime, 
        0.016, // Fixed delta time (roughly 60fps) for consistent pulse speed
        new Cesium.JulianDate()
      );
      viewer.clock.currentTime = currentTime;
      
      // Update last pulse time
      lastPulseUpdateTime = now;
    }
  } else if (!isPulsing) {
    // Reset the timer when no pulsing entities
    lastPulseUpdateTime = null;
  }
  
  requestAnimationFrame(handlePulseWithoutAnimation);
}
handlePulseWithoutAnimation();
// ============================
// Pulse Control Handlers
// ============================
function startPulseEffect(entity) {
  if (!entity || !entity.sensorParam) return;
  
  // Get current range directly from the graphic object
  let currentRange;
  if (entity.sensorParam.type === 'sphere' && entity.ellipsoid && entity.ellipsoid.radii) {
    // Set originalDetectionRange doar dacă nu a fost deja setată
    if (!entity.originalDetectionRange) {
      const currentRadii = entity.ellipsoid.radii.getValue(viewer.clock.currentTime);
      if (currentRadii) {
        // Se presupune că sfera are aceeași rază pe toate axele
        currentRange = currentRadii.x; 
      } else {
        currentRange = entity.sensorParam.detectionRange || 1000;
      }
      entity.originalDetectionRange = currentRange;
    }
  } else if (entity.sensorParam.type === 'cone' && entity.cylinder) {
    // Setează valorile originale doar dacă nu au fost deja definite
    if (!entity.originalConeHeight || !entity.originalConeRadius) {
      const height = entity.cylinder.length?.getValue(viewer.clock.currentTime) || 
                    entity.sensorParam.detectionRange || 1000;
      
      const bottomRadius = entity.cylinder.bottomRadius?.getValue(viewer.clock.currentTime) || 
                       (height / 3) || 300; // Menține proporția
      
      entity.originalConeHeight = height;
      entity.originalConeRadius = bottomRadius;
      
      // Stochează raportul pentru menținerea formei conului
      entity.coneRatio = bottomRadius / height;
    }
  } else {
    // Fallback to the value from sensorParam
    currentRange = entity.sensorParam.detectionRange || 1000;
  }
  
  entity.isPulsing = true;
  
  // Create a pulsation effect using CallbackProperty
  if (entity.sensorParam.type === 'sphere') {
    // Existing sphere pulse code
    entity.ellipsoid = new Cesium.EllipsoidGraphics({
      radii: new Cesium.CallbackProperty(function(time) {
        const seconds = Cesium.JulianDate.secondsDifference(time, viewer.clock.startTime);
        // Calculate a pulse factor between 0.01 (1%) and 1.0 (100%) based on time
        const pulseFactor = 0.01 + 0.99 * Math.abs(Math.sin(seconds * Math.PI));
        const pulseRange = entity.originalDetectionRange * pulseFactor;
        
        return new Cesium.Cartesian3(pulseRange, pulseRange, pulseRange);
      }, false),
      material: entity.ellipsoid.material,
      outline: entity.ellipsoid.outline,
      outlineColor: entity.ellipsoid.outlineColor,
      outlineWidth: entity.ellipsoid.outlineWidth,
      slicePartitions: entity.ellipsoid.slicePartitions,
      stackPartitions: entity.ellipsoid.stackPartitions
    });
  } else if (entity.sensorParam.type === 'cone') {
    // Save the original properties
    const originalMaterial = entity.cylinder.material;
    const originalOutline = entity.cylinder.outline;
    const originalOutlineColor = entity.cylinder.outlineColor;
    const originalOutlineWidth = entity.cylinder.outlineWidth;
    const originalSlices = entity.cylinder.slices || 16;
    const originalVerticalLines = entity.cylinder.numberOfVerticalLines || 16;
    
    // Modificare: Implementare pentru pulsația conului care garantează că atinge dimensiunea maximă originală
    entity.cylinder = new Cesium.CylinderGraphics({
      length: new Cesium.CallbackProperty(function(time) {
        const seconds = Cesium.JulianDate.secondsDifference(time, viewer.clock.startTime);
        // Modificăm funcția pentru a asigura că atinge exact dimensiunea originală la maxim
        const sinValue = Math.sin(seconds * Math.PI);
        // Când sinValue este 1, pulseFactor va fi 1.0 (dimensiune 100%)
        // Când sinValue este -1, pulseFactor va fi 0.01 (dimensiune 1%)
        const pulseFactor = 0.01 + 0.99 * (sinValue > 0 ? sinValue : Math.abs(sinValue));
        return entity.originalConeHeight * pulseFactor;
      }, false),
      bottomRadius: new Cesium.CallbackProperty(function(time) {
        const seconds = Cesium.JulianDate.secondsDifference(time, viewer.clock.startTime);
        // Folosim aceeași logică și pentru rază pentru a menține forma conului
        const sinValue = Math.sin(seconds * Math.PI);
        const pulseFactor = 0.01 + 0.99 * (sinValue > 0 ? sinValue : Math.abs(sinValue));
        return entity.originalConeRadius * pulseFactor;
      }, false),
      topRadius: 0, // Se setează 0 pentru a avea vârful în partea de sus
      material: originalMaterial,
      outline: originalOutline,
      outlineColor: originalOutlineColor,
      outlineWidth: originalOutlineWidth,
      slices: originalSlices,
      numberOfVerticalLines: originalVerticalLines
    });
  }
}

// The stopPulseEffect function stays mostly the same
function stopPulseEffect(entity) {
  if (!entity || !entity.isPulsing) return;
  
  // Mark as not pulsing
  entity.isPulsing = false;
  
  if (entity.sensorParam.type === 'sphere') {
    // For spheres, set a fixed radius
    const range = entity.originalDetectionRange || 1000;
    entity.ellipsoid.radii = new Cesium.ConstantProperty(new Cesium.Cartesian3(range, range, range));
  } 
  else if (entity.sensorParam.type === 'cone' && !entity.isAnimated) {
    // For non-animated cones, restore original dimensions
    const originalHeight = entity.originalConeHeight || 1000;
    const originalRadius = entity.originalConeRadius || 300;
    
    // Get current material and appearance properties
    const originalMaterial = entity.cylinder.material;
    const originalOutline = entity.cylinder.outline;
    const originalOutlineColor = entity.cylinder.outlineColor;
    const originalOutlineWidth = entity.cylinder.outlineWidth;
    const originalSlices = entity.cylinder.slices || 16;
    const originalVerticalLines = entity.cylinder.numberOfVerticalLines || 16;
    
    // Create a new cylinder with fixed dimensions
    entity.cylinder = new Cesium.CylinderGraphics({
      length: originalHeight,
      topRadius: 0,
      bottomRadius: originalRadius,
      material: originalMaterial,
      outline: originalOutline,
      outlineColor: originalOutlineColor,
      outlineWidth: originalOutlineWidth,
      slices: originalSlices,
      numberOfVerticalLines: originalVerticalLines
    });
  }
  
  // Check if we need to stop the clock
  if (!anySensorAnimated() && !anyEntityPulsing()) {
    viewer.clock.shouldAnimate = false;
  }
}


// Helper function to check if any entity is pulsing
function anyEntityPulsing() {
  return viewer.entities.values.some(entity => entity.isPulsing === true);
}


let isPulseActive = false;

document.getElementById('pulseOnButton').addEventListener('click', function() {
  if (!selectedEntity) return;
  
  if (selectedEntity.isPulsing) return;

  // Set the pulse flag directly on the entity
  selectedEntity.pulseActivatedManually = true;
  isPulseActive = true;
  
  // Start the pulse effect regardless of animation state
  if (selectedEntity.sensorParam && 
      (selectedEntity.sensorParam.type === 'sphere' || selectedEntity.sensorParam.type === 'cone')) {
    
    // Start pulsing
    startPulseEffect(selectedEntity);
    
    // If no animations are running, reset the update timer
    if (!anySensorAnimated()) {
      lastPulseUpdateTime = Date.now();
      viewer.clock.shouldAnimate = false;
    }
  }
});



document.getElementById('pulseOffButton').addEventListener('click', function() {
  isPulseActive = false;
  
  if (selectedEntity && selectedEntity.sensorParam && 
      (selectedEntity.sensorParam.type === 'sphere' || selectedEntity.sensorParam.type === 'cone')) {
    
    // Remove the flag indicating manual activation of pulse
    selectedEntity.pulseActivatedManually = false;
    
    // Remove the pulse effect only if it's actually pulsing
    if (selectedEntity.isPulsing) {
      // For cones with animation still active
      if (selectedEntity.isAnimated && selectedEntity.sensorParam.type === 'cone') {
        // Save current properties
        const originalMaterial = selectedEntity.cylinder.material;
        const originalOutline = selectedEntity.cylinder.outline;
        const originalOutlineColor = selectedEntity.cylinder.outlineColor;
        const originalOutlineWidth = selectedEntity.cylinder.outlineWidth;
        const originalSlices = selectedEntity.cylinder.slices || 16;
        const originalVerticalLines = selectedEntity.cylinder.numberOfVerticalLines || 16;
        
        // Create a new cylinder with fixed dimensions but keep it animated
        selectedEntity.cylinder = new Cesium.CylinderGraphics({
          length: selectedEntity.originalConeHeight,
          topRadius: 0,
          bottomRadius: selectedEntity.originalConeRadius,
          material: originalMaterial,
          outline: originalOutline,
          outlineColor: originalOutlineColor,
          outlineWidth: originalOutlineWidth,
          slices: originalSlices,
          numberOfVerticalLines: originalVerticalLines
        });
        
        // Mark as not pulsing anymore
        selectedEntity.isPulsing = false;
      } 
      // For spheres or non-animated cones
      else {
        stopPulseEffect(selectedEntity);
      }
    }
    
    // Check if we should stop the clock when no pulses or animations remain
    if (!anySensorAnimated() && !anyEntityPulsing()) {
      viewer.clock.shouldAnimate = false;
    }
  }
});


// ==============
// Single Sensor
// ==============
let selectedSensorType = null;
let sensorEntities = [];
let currentSensorParam = null;
let draggingSensorItem = null;

// Only one sensor's parameters: Ultrasonic
const sensorParameters = {
  'Ultrasonic': {
    minRange: 0.02,
    maxRange: 10,
    defaultRange: 5,
    minFov: 1,
    maxFov: 30,
    defaultFov: 15,
    color: '#0000FF',
    unit: 'm',
    description: 'Ultrasonic sensors measure distance using ultrasonic waves, typically used for obstacle detection and ranging in robotics and vehicles.',
    type: 'cone',
    icon: 'https://img.icons8.com/fluency/48/000000/sensor.png',
  },

  'Omnidirectional': {
    minRange: 0.5,
    maxRange: 100,
    defaultRange: 50,
    color: '#FF00FF',
    transparency: 0.5,
    unit: 'm',
    description: 'Omnidirectional sensor that detects signals from all directions.',
    type: 'sphere',
    icon: 'https://img.icons8.com/fluency/48/000000/sensor.png'
  },

  'Geophone': {
    minRange: 0.02,
    maxRange: 10, 
    defaultRange: 5,
    minFov: 1,
    maxFov: 30,
    defaultFov: 15,
    color: '#0000FF',
    unit: 'm',
    description: 'Geophone sensors detect ground vibrations and seismic waves, commonly used in geophysical surveys, earthquake monitoring, and oil exploration to analyze subsurface structures.',
    type: 'cone',
    icon: 'images/geophone.png',
  },

  'Hall Effect Sensor': {
    minRange: 0.02,
    maxRange: 10, 
    defaultRange: 5,
    minFov: 1,
    maxFov: 30,
    defaultFov: 15,
    color: '#0000FF',
    unit: 'm',
    description: 'Hall Effect sensors, like the Sunkee A3144 V4, are used to detect magnetic fields and can be employed in applications such as position sensing, speed detection, and current sensing in various electronic devices and automotive systems',
    type: 'cone',
    icon: 'images/hall_effect_sensor.png',
  },

  'Hydrophone': {
    minRange: 0.02,
    maxRange: 10,
    defaultRange: 5,
    minFov: 1,
    maxFov: 30,
    defaultFov: 15,
    color: '#0000FF',
    unit: 'm',
    description: 'Hydrophones are specialized underwater microphones designed to detect sound waves in water. They are commonly used in marine research, underwater acoustics, and for monitoring marine life and environmental conditions.',
    type: 'cone',
    icon: 'images/hydrophone.png',
  },

  'Inductioncoil': {
    minRange: 0.02,
    maxRange: 10,
    defaultRange: 5,
    minFov: 1,
    maxFov: 30,
    defaultFov: 15,
    color: '#0000FF',
    unit: 'm',
    description: 'Induction coil sensors are used to detect magnetic fields and variations in their intensity, making them valuable for measuring ULF signals. These sensors are employed in applications such as monitoring electromagnetic fields, studying geological formations, and conducting research in low-frequency electromagnetic wave propagation, enabling better understanding of both natural and man-made phenomena.',
    type: 'cone',
    icon: 'images/inductioncoil.png',
  },

  'Magnetic loop antenna': {
    minRange: 0.02,
    maxRange: 10,
    defaultRange: 5,
    minFov: 1,
    maxFov: 30,
    defaultFov: 15,
    color: '#0000FF',
    unit: 'm',
    description: 'Magnetic loop antennas are specialized antennas designed for efficient operation at Very Low Frequencies (VLF). These antennas are widely used in applications such as maritime communication, research in electromagnetic field studies, and environmental monitoring.',
    type: 'cone',
    icon: 'images/magnetic_loop_antenna.png',
  },

  'Magnetometers': {
    minRange: 0.02,
    maxRange: 10,
    defaultRange: 5,
    minFov: 1,
    maxFov: 30,
    defaultFov: 15,
    color: '#0000FF',
    unit: 'm',
    description: 'Magnetometers are sensitive instruments used to measure the strength and direction of magnetic fields, particularly effective at Ultra Low Frequencies (ULF). These sensors play a crucial role in various applications, including geological surveys, monitoring seismic activity, and studying Earth`s magnetic field variations. By detecting minute changes in magnetic fields, magnetometers provide valuable data for research in geophysics, archaeology, and environmental science',
    type: 'cone',
    icon: 'images/magnetometers.png',
  },

  'MEMS Accelerometer': {
    minRange: 0.02,
    maxRange: 10,
    defaultRange: 5,
    minFov: 1,
    maxFov: 30,
    defaultFov: 15,
    color: '#0000FF',
    unit: 'm',
    description: 'MEMS(Micro-Electro-Mechanical Systems) accelerometers are compact devices used to measure acceleration forces and vibrations, particularly effective in Low Frequency (LF) applications. These sensors leverage microfabrication technology to detect changes in motion, enabling a wide range of applications, including motion tracking, tilt sensing, and vibration analysis.',
    type: 'cone',
    icon: 'images/mems_accelerometer.png',
  }
};

//###########################################################################################
// YOU CAN ADD YOUR OWN SENSORS HERE ABOVE ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
//############################################################################################

// Populate sensor selection list with only the Ultrasonic sensor
const sensorListElement = document.getElementById('sensorList');
for (const sensorType in sensorParameters) {
  const li = document.createElement('li');
  li.className = 'sensor-item';
  li.draggable = true;
  li.setAttribute('data-sensor-type', sensorType);

  const img = document.createElement('img');
  img.src = sensorParameters[sensorType].icon;
  img.alt = sensorType;

  const name = document.createElement('div');
  name.className = 'sensor-name';
  name.textContent = sensorType;

  li.appendChild(img);
  li.appendChild(name);
  sensorListElement.appendChild(li);
}

// Handle sensor drag events
const sensorItems = document.getElementsByClassName('sensor-item');
Array.from(sensorItems).forEach(item => {
  item.addEventListener('dragstart', (e) => {
    selectedSensorType = item.getAttribute('data-sensor-type');
    currentSensorParam = Object.assign({}, sensorParameters[selectedSensorType]);
    displaySensorInfo(selectedSensorType, currentSensorParam);
    setupParameterControls(currentSensorParam);
    draggingSensorItem = item;
    e.dataTransfer.setData('text/plain', '');
  });
});

// Handle drop on the Cesium canvas for sensor
const cesiumContainer = viewer.container;
cesiumContainer.addEventListener('dragover', (e) => {
  e.preventDefault();
});

cesiumContainer.addEventListener('drop', (e) => {
  e.preventDefault();
  if (selectedSensorType && currentSensorParam) {
    const canvasBounds = cesiumContainer.getBoundingClientRect();
    const x = e.clientX - canvasBounds.left;
    const y = e.clientY - canvasBounds.top;
    const windowPosition = new Cesium.Cartesian2(x, y);
    const earthPosition = viewer.scene.pickPosition(windowPosition);

    if (Cesium.defined(earthPosition)) {
      createDraggableSensor(selectedSensorType, earthPosition, currentSensorParam);
    }

    selectedSensorType = null;
    currentSensorParam = null;
    draggingSensorItem = null;
  }
});

// Simulation Controls
const playButton = document.getElementById('playButton');
const pauseButton = document.getElementById('pauseButton');
const resetButton = document.getElementById('resetButton');
const clearButton = document.getElementById('clearButton');

playButton.addEventListener('click', () => {
  viewer.clock.shouldAnimate = true;
});
pauseButton.addEventListener('click', () => {
  viewer.clock.shouldAnimate = false;
});
resetButton.addEventListener('click', () => {
  viewer.clock.currentTime = viewer.clock.startTime.clone();
  viewer.clock.shouldAnimate = false;
});
clearButton.addEventListener('click', () => {
  viewer.entities.removeAll();
  sensorEntities = [];
});

// Display sensor information
function displaySensorInfo(sensorType, sensorParam) {
  const sensorInfoElement = document.getElementById('sensorInfo');
  sensorInfoElement.innerHTML = `
    <p><strong>${sensorType}</strong></p>
    <p>${sensorParam.description}</p>
    <p>Default Range: ${sensorParam.defaultRange} ${sensorParam.unit}</p>
    <p>Default Field of View: ${sensorParam.defaultFov}°</p>
  `;
}

// Setup parameter controls for the single sensor
function setupParameterControls(sensorParam) {
  const parameterControls = document.getElementById('parameterControls');
  parameterControls.innerHTML = '';

  // Exemplu pentru slider-ul de Range
  if (sensorParam.minRange !== undefined && sensorParam.maxRange !== undefined) {
    const rangeContainer = document.createElement('div');
    rangeContainer.className = 'slider-container';

    const rangeLabel = document.createElement('label');
    rangeLabel.textContent = `Detection Range (${sensorParam.unit}): ${sensorParam.defaultRange}`;

    const rangeSlider = document.createElement('input');
    rangeSlider.type = 'range';
    rangeSlider.min = sensorParam.minRange;
    rangeSlider.max = sensorParam.maxRange;
    rangeSlider.value = sensorParam.defaultRange;
    rangeSlider.step = '0.01';

    rangeSlider.addEventListener('input', () => {
      if (activeSensorEntity) {
        activeSensorEntity.sensorParam.defaultRange = parseFloat(rangeSlider.value);
        rangeLabel.textContent = `Detection Range (${activeSensorEntity.sensorParam.unit}): ${activeSensorEntity.sensorParam.defaultRange}`;
        updateSensorVisual(activeSensorEntity);
      }
    });

    rangeContainer.appendChild(rangeLabel);
    rangeContainer.appendChild(rangeSlider);
    parameterControls.appendChild(rangeContainer);
  }

  // Similar pentru slider-ul de Field of View (FOV)
  if (sensorParam.minFov !== undefined && sensorParam.maxFov !== undefined) {
    const fovContainer = document.createElement('div');
    fovContainer.className = 'slider-container';

    const fovLabel = document.createElement('label');
    fovLabel.textContent = `Field of View (°): ${sensorParam.defaultFov}`;

    const fovSlider = document.createElement('input');
    fovSlider.type = 'range';
    fovSlider.min = sensorParam.minFov;
    fovSlider.max = sensorParam.maxFov;
    fovSlider.value = sensorParam.defaultFov;
    fovSlider.step = '1';

    fovSlider.addEventListener('input', () => {
      if (activeSensorEntity) {
        activeSensorEntity.sensorParam.defaultFov = parseFloat(fovSlider.value);
        fovLabel.textContent = `Field of View (°): ${activeSensorEntity.sensorParam.defaultFov}`;
        updateSensorVisual(activeSensorEntity);
      }
    });

    fovContainer.appendChild(fovLabel);
    fovContainer.appendChild(fovSlider);
    parameterControls.appendChild(fovContainer);
  }

  // Exemplu pentru color picker (folosind Spectrum)
  const colorContainer = document.createElement('div');
  colorContainer.className = 'color-picker';

  const colorLabel = document.createElement('label');
  colorLabel.textContent = 'Sensor Color:';

  const colorInput = document.createElement('input');
  colorInput.type = 'text';
  colorInput.id = 'colorPicker';

  colorContainer.appendChild(colorLabel);
  colorContainer.appendChild(colorInput);
  parameterControls.appendChild(colorContainer);

  // Inițializează Spectrum cu culoarea senzorului activ
  $("#colorPicker").spectrum({
    color: sensorParam.color,
    showInput: true,
    preferredFormat: "hex",
    showPalette: true,
    palette: [],
    change: function(color) {
      if (activeSensorEntity) {
        activeSensorEntity.sensorParam.color = color.toHexString();
        updateSensorVisual(activeSensorEntity);
      }
    }
  });
}

// Function to update sensor visualization based on parameters
function updateSensorVisual(sensorEntity) {
  const sensorParam = sensorEntity.sensorParam;
  const range = sensorParam.defaultRange;
  const fov = sensorParam.defaultFov;
  const color = Cesium.Color.fromCssColorString(sensorParam.color).withAlpha(0.5);

  if (sensorEntity.cylinder) {
    if (sensorEntity.isPulsing) {
      // If pulsing, update original dimensions but keep pulse effect
      sensorEntity.originalConeHeight = range;
      sensorEntity.originalConeRadius = range * Math.tan(Cesium.Math.toRadians(fov / 2));
    } else {
      // If not pulsing, update cylinder directly
      sensorEntity.cylinder.length = range;
      sensorEntity.cylinder.bottomRadius = range * Math.tan(Cesium.Math.toRadians(fov / 2));
    }
    sensorEntity.cylinder.material = color;
  } else if (sensorEntity.ellipsoid) {
    if (sensorEntity.isPulsing) {
      // If pulsing, update original range but keep pulse effect
      sensorEntity.originalDetectionRange = range;
    } else {
      // If not pulsing, update ellipsoid directly
      sensorEntity.ellipsoid.radii = new Cesium.Cartesian3(range, range, range);
    }
    sensorEntity.ellipsoid.material = color;
  } else if (sensorEntity.point) {
    sensorEntity.point.color = Cesium.Color.fromCssColorString(sensorParam.color);
  }
}


let activeSensorEntity = null;

viewer.screenSpaceEventHandler.setInputAction((click) => {
  const picked = viewer.scene.pick(click.position);
  // Verifică dacă obiectul selectat are proprietatea sensorParam (adică este un senzor)
  if (Cesium.defined(picked) && picked.id && picked.id.sensorParam) {
    activeSensorEntity = picked.id;
    // Actualizează panoul de informații și controalele cu parametrii senzorului selectat
    displaySensorInfo(activeSensorEntity.sensorParam.type, activeSensorEntity.sensorParam);
    setupParameterControls(activeSensorEntity.sensorParam);
  }
}, Cesium.ScreenSpaceEventType.LEFT_CLICK);

// Create a draggable sensor entity with coverage geometry
function createDraggableSensor(sensorType, position, sensorParam) {
  // Creează o copie a parametrilor pentru senzorul curent
  const sensorParamCopy = Object.assign({}, sensorParam);
  const range = sensorParamCopy.defaultRange;
  const fov = sensorParamCopy.defaultFov;
  const color = Cesium.Color.fromCssColorString(sensorParamCopy.color).withAlpha(0.5);

  // List of senzors that use 3D models
  const sensorModels = {
    'Geophone': 'images/geophone.gltf',
    'Hall Effect Sensor': 'images/hall_effect_sensor.gltf',
    'Hydrophone': 'images/hydrophone.gltf',
    'Inductioncoil': 'images/inductioncoil.gltf',
    'Magnetic loop antenna': 'images/magnetic_loop_antenna.gltf',
    'Magnetometers': 'images/magnetometers.gltf',
    'MEMS Accelerometer': 'images/mems_accelerometer.gltf'
  };

  // Calculate the flat orientation immediately when creating the entity
  const flatOrientation = createFlatOrientation(position);

  const entityOptions = {
    position: position,
    name: sensorParamCopy.type + " Sensor",
    // Stochează copia parametrilor direct în entitate
    sensorParam: sensorParamCopy,
    label: {
      text: sensorType,
      font: '14pt Orbitron, sans-serif',
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      fillColor: Cesium.Color.YELLOW,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 2,
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      pixelOffset: new Cesium.Cartesian2(0, -50),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    }
  };

  // 3D model visualization
  if (sensorModels[sensorType]) {
    entityOptions.model = {
      uri: sensorModels[sensorType],
      scale: sensorParamCopy.modelScale || 1.0,
      minimumPixelSize: 64,
      maximumScale: 20000
    };
    
    // Apply the correct orientation for GLTF models right from the start
    entityOptions.orientation = new Cesium.ConstantProperty(flatOrientation);
  }
  // Cone visualization for Ultrasonic
  else if (sensorParam.type === 'cone') {
    entityOptions.cylinder = {
      length: range,
      topRadius: 0.0,
      bottomRadius: range * Math.tan(Cesium.Math.toRadians(fov / 2)),
      material: color,
      outline: true,
      outlineColor: Cesium.Color.WHITE,
      numberOfVerticalLines: 8,
      slices: 128,
    };
  } 
  //Sphere visualization for Omnidirectional
  else if (sensorParam.type === 'sphere') {
    entityOptions.ellipsoid = {
      radii: new Cesium.Cartesian3(range, range, range),
      material: color,
      outline: true,
      outlineColor: Cesium.Color.WHITE,
    };
    
    // Apply the correct orientation for sphere sensors
    entityOptions.orientation = new Cesium.ConstantProperty(flatOrientation);
  }

  const sensorEntity = viewer.entities.add(entityOptions);
  sensorEntities.push(sensorEntity);
  
  // Store the initial orientation values
  sensorEntity.initialOrientation = flatOrientation.clone();
  sensorEntity.baseOrientation = flatOrientation.clone();
  
  // Mark that this entity has already been properly oriented
  sensorEntity.hasBeenSelectedBefore = true;
  
  // Initialize rotation values
  sensorEntity.rotationX = 0;
  sensorEntity.rotationY = 0;
  sensorEntity.rotationZ = 0;

  // Permite deplasarea entității (se poate păstra logica existentă în makeEntityDraggable)
  makeEntityDraggable(sensorEntity);
}

// Variabile globale pentru controlul mișcării pe axele X, Y, Z
let selectedAxis = null;

// Adăugare butoane pentru selecția axelor
const controlsContainer = document.createElement('div');
controlsContainer.id = 'axisControls';
controlsContainer.innerHTML = `
  <button id="moveX">Move X</button>
  <button id="moveY">Move Y</button>
  <button id="moveZ">Move Z</button>
`;
document.body.appendChild(controlsContainer);

document.getElementById('moveX').addEventListener('click', () => selectedAxis = 'x');
document.getElementById('moveY').addEventListener('click', () => selectedAxis = 'y');
document.getElementById('moveZ').addEventListener('click', () => selectedAxis = 'z');

// Make an entity (sensor) draggable
function makeEntityDraggable(entity, sensorParam) {
  let isDragging = false;
  let handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

  handler.setInputAction(function (click) {
    let pickedObject = viewer.scene.pick(click.position);
    if (Cesium.defined(pickedObject) && pickedObject.id === entity) {
      isDragging = true;
      viewer.scene.screenSpaceCameraController.enableRotate = false;
      viewer.container.style.cursor = 'move';
    }
  }, Cesium.ScreenSpaceEventType.LEFT_DOWN);




  handler.setInputAction(function (movement) {
    if (isDragging) {
      let cartesian = viewer.camera.pickEllipsoid(movement.endPosition, viewer.scene.globe.ellipsoid);
      if (cartesian) {
        let position = Cesium.Cartesian3.clone(entity.position.getValue(Cesium.JulianDate.now()));
        let newPosition = new Cesium.Cartesian3(position.x, position.y, position.z);

        if (selectedAxis === 'x') {
          newPosition.x = cartesian.x;
        } else if (selectedAxis === 'y') {
          newPosition.y = cartesian.y;
        } else if (selectedAxis === 'z') {
          newPosition.z = cartesian.z;
        }

        entity.position = newPosition;
        showTooltip(movement.endPosition, `Moving on ${selectedAxis.toUpperCase()} axis`);
      }
    } else {
      let pickedObject = viewer.scene.pick(movement.endPosition);
      if (Cesium.defined(pickedObject) && pickedObject.id === entity) {
        viewer.container.style.cursor = 'pointer';
      } else {
        viewer.container.style.cursor = 'default';
      }
    }
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);




  handler.setInputAction(function () {
    if (isDragging) {
      isDragging = false;
      viewer.scene.screenSpaceCameraController.enableRotate = true;
      viewer.container.style.cursor = 'default';
      hideTooltip();
    }
  }, Cesium.ScreenSpaceEventType.LEFT_UP);

  // Update the entity when parameters change
  function parameterHandler() {
    const range = sensorParam.defaultRange;
    const fov = sensorParam.defaultFov;
    const color = Cesium.Color.fromCssColorString(sensorParam.color).withAlpha(0.5);

    if (entity.cylinder) {
      entity.cylinder.length = range;
      entity.cylinder.bottomRadius = range * Math.tan(Cesium.Math.toRadians(fov / 2));
      entity.cylinder.material = color;
    }
  }
  const parameterControls = document.getElementById('parameterControls');
  parameterControls.addEventListener('input', parameterHandler);
  parameterControls.addEventListener('change', parameterHandler);
}

// Tooltip functionality
const tooltip = document.getElementById('tooltip');
function showTooltip(screenPosition, message) {
  tooltip.style.left = (screenPosition.x + 15) + 'px';
  tooltip.style.top = (screenPosition.y + 15) + 'px';
  tooltip.innerHTML = message;
  tooltip.style.display = 'block';
}
function hideTooltip() {
  tooltip.style.display = 'none';
}
function getMousePosition(event) {
  const mousePosition = new Cesium.Cartesian2(event.endPosition.x, event.endPosition.y);
  return viewer.scene.pickPosition(mousePosition);
}

// ============================
// Search Functionality
// ============================
const searchButton = document.getElementById('searchButton');
const latitudeInput = document.getElementById('latitudeInput');
const longitudeInput = document.getElementById('longitudeInput');
const searchError = document.getElementById('searchError');

function validateCoordinates(lat, lon) {
  const latNum = parseFloat(lat);
  const lonNum = parseFloat(lon);
  if (isNaN(latNum) || isNaN(lonNum)) return false;
  if (latNum < -90 || latNum > 90 || lonNum < -180 || lonNum > 180) return false;
  return true;
}

searchButton.addEventListener('click', () => {
  const lat = latitudeInput.value.trim();
  const lon = longitudeInput.value.trim();

  if (!validateCoordinates(lat, lon)) {
    searchError.style.display = 'block';
    return;
  }
  searchError.style.display = 'none';

  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(parseFloat(lon), parseFloat(lat), 5000),
    orientation: {
      heading: Cesium.Math.toRadians(0.0),
      pitch: Cesium.Math.toRadians(-45.0),
      roll: 0.0
    },
    duration: 2
  });
});

// Allow pressing Enter to trigger search
latitudeInput.addEventListener('keyup', (event) => {
  if (event.key === 'Enter') {
    searchButton.click();
  }
});
longitudeInput.addEventListener('keyup', (event) => {
  if (event.key === 'Enter') {
    searchButton.click();
  }
});
// ============================
// End of Search Functionality
// ============================