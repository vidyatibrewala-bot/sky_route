const GRID_SIZE = 30;
const GRID_STEP = 0.0008;

const MEDICAL_CARGOS = [
    { name: "Emergency Heart", type: "HUMAN ORGAN", icon: "🫀", priority: "CRITICAL", weight: "1.2kg", urgency: 1.0 },
    { name: "Insulin Batch #42", type: "REFRIGERATED MEDICINE", icon: "🌡️", priority: "HIGH", weight: "3.5kg", urgency: 1.0 },
    { name: "First Aid Kit - XL", type: "TRAUMA SUPPLIES", icon: "🩹", priority: "NORMAL", weight: "5.0kg", urgency: 0.0 },
    { name: "O+ Blood Units", type: "FLUID THERAPY", icon: "🩸", priority: "CRITICAL", weight: "2.4kg", urgency: 1.0 },
    { name: "Antivenom Vial", type: "EMERGENCY SERUM", icon: "🧪", priority: "HIGH", weight: "0.8kg", urgency: 1.0 },
    { name: "Surgical Tools", type: "STERILE EQUIPMENT", icon: "✂️", priority: "NORMAL", weight: "4.2kg", urgency: 0.0 }
];

function speak(text) {
    if ('speechSynthesis' in window) {
        // Prevent speech queue from stacking endlessly
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.volume = 0.6; u.rate = 1.05; u.pitch = 0.95;
        window.speechSynthesis.speak(u);
    }
}

let state = {
    dronePos: { x: 0, y: 0 },
    droneLatLng: [31.1048, 77.1734],
    centerLatLng: [31.1048, 77.1734],
    targetLatLng: null,
    predictedPath: [], // AI trajectory
    hospitals: [],
    obstacles: [],
    geofences: [],
    geofenceWarning: false,
    battery: 500.0,
    playing: false,
    controlMode: 'AI',
    interval: null,
    weather: 'CLEAR',
    flightPath: [],
    currentCargo: MEDICAL_CARGOS[0],
    initialBattery: 500.0,
    totalDistance: 0,
    missionHistory: [],
    currentSerial: "SR-ALPHA"
};

// Map Layer Objects
let map, droneMarker, trailPolyline, predictedPolyline;
let hospitalMarkers = [];
let obstacleMarkers = [];
let geofencePolygons = [];
let ghostMarkers = []; // For swarm simulation

// DOM Elements
const actionLog = document.getElementById('action-log');
const batteryVal = document.getElementById('battery-val');
const batteryBar = document.getElementById('battery-bar');
const batteryBox = document.getElementById('battery-box');

const btnStart = document.getElementById('btn-start');
const btnReset = document.getElementById('btn-reset');
const btnEmergency = document.getElementById('btn-emergency');
const statusBadge = document.getElementById('status-badge');
const signalBadge = document.getElementById('signal-badge');
const noLandingBadge = document.getElementById('no-landing-badge');
const signalLostOverlay = document.getElementById('signal-lost-overlay');
const criticalAlert = document.getElementById('critical-alert');

const modeAiBtn = document.getElementById('mode-ai');
const modeManualBtn = document.getElementById('mode-manual');
const dpadControls = document.getElementById('dpad-controls');

const weatherBadge = document.getElementById('weather-badge');
const hazardBadge = document.getElementById('hazard-badge');
const speedBadge = document.getElementById('speed-badge'); // NEW
const reticle = document.getElementById('reticle');

const inputLat = document.getElementById('target-lat');
const inputLng = document.getElementById('target-lng');
const citySearchInput = document.getElementById('city-search');
const btnSearch = document.getElementById('btn-search');

const cargoName = document.getElementById('cargo-name');
const cargoType = document.getElementById('cargo-type');
const cargoIcon = document.getElementById('cargo-icon');
const cargoPriority = document.getElementById('cargo-priority');
const cargoWeight = document.getElementById('cargo-weight');

const reviewModal = document.getElementById('mission-review-modal');
const btnReviewCloseActual = document.getElementById('btn-review-close');
const reviewGrade = document.getElementById('review-grade');
const reviewStatus = document.getElementById('review-status');
const reviewDist = document.getElementById('review-dist');
const reviewTime = document.getElementById('review-time');
const reviewTrgtDist = document.getElementById('review-trgt-dist');
const reviewBatteryBar = document.getElementById('review-battery-bar');
const historyList = document.getElementById('history-list');
const btnExportLogs = document.getElementById('btn-export-logs'); // NEW

// New Feature DOM Hooks
const weatherOverlay = document.getElementById('weather-effect-overlay');
const fpvCamera = document.getElementById('fpv-camera');
const fpvCoord = document.getElementById('fpv-coord');

const cargoModal = document.getElementById('cargo-modal');
const cargoSelectionGrid = document.getElementById('cargo-selection-grid');
const btnConfirmCargo = document.getElementById('btn-confirm-cargo');
const btnCancelCargo = document.getElementById('btn-cancel-cargo');

const fleetAlpha = document.getElementById('fleet-alpha');
const fleetBeta = document.getElementById('fleet-beta');
const fleetGamma = document.getElementById('fleet-gamma');

// Asset Icons
const droneIcon = L.icon({
    iconUrl: 'assets/drone.png', iconSize: [42, 42], iconAnchor: [21, 21], className: 'drone-icon-class'
});
const ghostDroneIcon = L.icon({
    iconUrl: 'assets/drone.png', iconSize: [28, 28], iconAnchor: [14, 14], className: 'drone-icon-class',
});
const hospitalIcon = L.icon({
    iconUrl: 'assets/hospital.png', iconSize: [60, 60], iconAnchor: [30, 30], className: 'hospital-icon-glow'
});
const houseIcon = L.icon({
    iconUrl: 'assets/house.png', iconSize: [30, 30], iconAnchor: [15, 15]
});
const mountainIcon = L.icon({
    iconUrl: 'assets/mountain.png', iconSize: [38, 38], iconAnchor: [19, 19]
});

// Initialize Map
function initMap() {
    map = L.map('map', { zoomControl: true, attributionControl: false }).setView(state.centerLatLng, 15);

    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19
    }).addTo(map);

    trailPolyline = L.polyline([], { color: '#10b981', weight: 4, opacity: 0.8 }).addTo(map); // Green Traveled Path
    predictedPolyline = L.polyline([], { color: '#3b82f6', weight: 3, opacity: 0.6, dashArray: '5, 10' }).addTo(map); // Blue Prediction Path

    map.on('mousemove', function (e) {
        if (state.playing) {
            reticle.classList.add('hidden');
            return;
        }
        reticle.classList.remove('hidden');
        let point = map.latLngToContainerPoint(e.latlng);
        reticle.style.left = point.x + 'px';
        reticle.style.top = point.y + 'px';
        reticle.querySelector('.reticle-label').textContent = `GPS: (${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)})`;
    });

    map.on('mouseout', () => reticle.classList.add('hidden'));

    map.on('click', function (e) {
        if (state.playing) return;
        setTargetPoint(e.latlng.lat, e.latlng.lng);
    });
}

function setTargetPoint(lat, lng) {
    state.targetLatLng = [lat, lng];
    inputLat.value = lat.toFixed(5);
    inputLng.value = lng.toFixed(5);
    setLog(`Target Locked: Sector (${lat.toFixed(4)}, ${lng.toFixed(4)})`, "green");
    speak("Sector locked. Awaiting launch authorization.");

    // Draw predicted line
    state.predictedPath = [state.droneLatLng, state.targetLatLng];
    predictedPolyline.setLatLngs(state.predictedPath);

    renderMapObjects();
}

async function searchCity() {
    const query = citySearchInput.value;
    if (!query) return;
    setLog(`Satellite Uplink: Searching for ${query}...`, "yellow");

    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query + ", India")}`);
        const data = await response.json();
        if (data && data.length > 0) {
            const lat = parseFloat(data[0].lat);
            const lon = parseFloat(data[0].lon);
            state.centerLatLng = [lat, lon];
            state.droneLatLng = [lat, lon];
            map.flyTo(state.centerLatLng, 15, { duration: 2 });
            setLog(`Sector Found: Synchronizing Local Infrastructure...`, "green");
            setTimeout(() => {
                fetchRealHospitals(lat, lon);
                fetchRealWeather(lat, lon); // Fetch actual weather
            }, 1000);

        } else {
            setLog("Satellite Error: Region Not Found in Database.", "red");
        }
    } catch (e) {
        setLog("Comms Link Error: Search Unavailable.", "red");
    }
}

// NEW: Real Open-Meteo weather integration
async function fetchRealWeather(lat, lng) {
    try {
        const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=weather_code,wind_speed_10m,temperature_2m`);
        const data = await res.json();

        let code = data.current.weather_code;
        let wind = data.current.wind_speed_10m; // km/h
        state.temp = data.current.temperature_2m;

        // Weather interpretation
        if (code >= 61 && code <= 99) {
            state.weather = 'STORM';
        } else if (wind > 20 || [45, 48].includes(code)) {
            state.weather = 'WIND'; // or Fog
        } else {
            state.weather = 'CLEAR';
        }

        updateWeatherUI();
    } catch (e) {
        console.error("Weather fetch failed.");
        state.weather = 'CLEAR';
        updateWeatherUI();
    }
}

function updateWeatherUI() {
    weatherBadge.className = `metric-badge-v weather-${state.weather.toLowerCase()}`;
    let tempStr = state.temp !== undefined ? ` | <b>${Math.round(state.temp)}°C</b>` : '';
    weatherBadge.innerHTML = `🛰️ ${state.weather}${tempStr}`;

    if (state.weather === 'STORM' || state.weather === 'WIND') {
        weatherOverlay.classList.remove('hidden');
        if (state.weather === 'STORM') weatherOverlay.className = 'weather-effect-overlay weather-rain';
        else weatherOverlay.className = 'weather-effect-overlay'; // Just dark overlay
    } else {
        weatherOverlay.classList.add('hidden');
    }
}

async function fetchRealHospitals(lat, lng) {
    const query = `[out:json];(node["amenity"="hospital"](around:3000, ${lat}, ${lng}););out body;`;
    const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;

    try {
        const response = await fetch(url);
        const data = await response.json();
        state.hospitals = data.elements.map(e => ({
            lat: e.lat, lng: e.lon, name: e.tags?.name || "Medical Center"
        }));

        hazardBadge.innerHTML = `🏪 Facilities Found: <b>${state.hospitals.length}</b>`;
        setLog(`Grid Scanning Complete. ${state.hospitals.length} Secure Landing Zones Marked.`, "green");

        generateObstacles(lat, lng);
        renderMapObjects();
    } catch (e) {
        setLog("Grid Scan Partially Failed. Using Local Backup Data.", "yellow");
        generateObstacles(lat, lng);
        renderMapObjects();
    }
}

function generateObstacles(lat, lng) {
    state.obstacles = [];
    state.geofences = [];
    for (let i = 0; i < 25; i++) {
        let olat = lat + (Math.random() - 0.5) * 0.02;
        let olng = lng + (Math.random() - 0.5) * 0.02;
        state.obstacles.push({ lat: olat, lng: olng, type: Math.random() > 0.5 ? 'HOUSE' : 'MOUNTAIN' });
    }

    // Generate 2 Geofenced No-Fly Zones
    for (let i = 0; i < 2; i++) {
        let glat = lat + (Math.random() - 0.5) * 0.015;
        let glng = lng + (Math.random() - 0.5) * 0.015;
        let p = [
            [glat, glng],
            [glat + 0.003, glng + 0.001],
            [glat + 0.002, glng + 0.004],
            [glat - 0.001, glng + 0.003]
        ];
        state.geofences.push(p);
    }
}

function setLog(msg, type = '') {
    actionLog.textContent = msg;
    if (type === 'red') actionLog.style.color = 'var(--acc-red)';
    else if (type === 'green') actionLog.style.color = 'var(--acc-green)';
    else if (type === 'yellow') actionLog.style.color = '#facc15';
    else actionLog.style.color = '#fff';
}

function updateTelemetryUI() {
    if (state.battery < 0) state.battery = 0;
    let displayPct = Math.min(100, (state.battery / 500) * 100);
    batteryVal.textContent = displayPct.toFixed(0) + "%";
    batteryBar.style.height = displayPct + "%";

    // Update Speed dynamically if moving
    if (state.playing) {
        let speed = (state.weather === 'CLEAR') ? 65 : (state.weather === 'WIND' ? 45 : 25);
        // Add slight random fluctuation for realism
        speed += Math.floor(Math.random() * 5) - 2;
        speedBadge.innerHTML = `🚀 Speed: <b style="color:#10b981">${speed} km/h</b>`;
    }

    if (displayPct < 30) {
        batteryBar.classList.add('battery-low-pulse');
        batteryVal.classList.add('text-warning');
        signalBadge.classList.remove('hidden');
        signalBadge.textContent = "SIGNAL: LOW POWER";
        if (state.playing && displayPct === 29) {
            speak("Warning. Battery low. Recommend immediate landing.");
        }
    } else {
        batteryBar.classList.remove('battery-low-pulse');
        batteryVal.classList.remove('text-warning');
        signalBadge.classList.add('hidden');
        batteryBar.style.backgroundColor = 'var(--acc-green)';
    }

    if (displayPct < 10 && state.playing) {
        signalLostOverlay.classList.remove('hidden');
        signalBadge.textContent = "COMM LINK UNSTABLE";
        if (criticalAlert.classList.contains('hidden')) {
            criticalAlert.classList.remove('hidden');
            speak("Critical Battery. Communication link degraded. Brace for emergency protocols.");
        }
    } else {
        signalLostOverlay.classList.add('hidden');
        if (displayPct >= 10) criticalAlert.classList.add('hidden');
    }
}

function renderMapObjects() {
    if (droneMarker) map.removeLayer(droneMarker);
    hospitalMarkers.forEach(m => map.removeLayer(m));
    obstacleMarkers.forEach(m => map.removeLayer(m));
    geofencePolygons.forEach(p => map.removeLayer(p));
    ghostMarkers.forEach(m => map.removeLayer(m));

    hospitalMarkers = [];
    obstacleMarkers = [];
    geofencePolygons = [];
    ghostMarkers = [];

    // Geofences
    state.geofences.forEach(pts => {
        let p = L.polygon(pts, { color: '#ef4444', fillColor: '#ef4444', fillOpacity: 0.15, weight: 2, dashArray: '4, 4' }).addTo(map);
        geofencePolygons.push(p);
    });

    state.hospitals.forEach(h => {
        let m = L.marker([h.lat, h.lng], {
            icon: hospitalIcon,
            riseOnHover: true
        }).addTo(map)
            .bindPopup(`<b>${h.name}</b><br>Safe Landing Zone`)
            .bindTooltip(`<div class="tactical-label-content">${h.name}</div>`, {
                permanent: true, direction: 'top', className: 'hospital-tactical-label', offset: [0, -35], opacity: 1
            });
        hospitalMarkers.push(m);
    });

    state.obstacles.forEach(o => {
        let m = L.marker([o.lat, o.lng], { icon: (o.type === 'HOUSE' ? houseIcon : mountainIcon) }).addTo(map);
        obstacleMarkers.push(m);
    });

    droneMarker = L.marker(state.droneLatLng, { icon: droneIcon, zIndexOffset: 2000 }).addTo(map);

    // Render Ghost Drones (Swarm simulation)
    if (state.geofences.length > 0) { // arbitrary condition so they spawn after scan
        let g1 = L.marker([state.droneLatLng[0] + 0.005, state.droneLatLng[1] + 0.005], { icon: ghostDroneIcon, opacity: 0.6 }).addTo(map);
        let g2 = L.marker([state.droneLatLng[0] - 0.004, state.droneLatLng[1] + 0.008], { icon: ghostDroneIcon, opacity: 0.6 }).addTo(map);
        ghostMarkers.push(g1, g2);
    }
}

function moveDrone(dlat, dlng) {
    if (!state.playing) return;

    let nlat = state.droneLatLng[0] + dlat;
    let nlng = state.droneLatLng[1] + dlng;

    // Check Geofence Breach (Simple Bounding Box)
    let insideGeofence = false;
    state.geofences.forEach(pts => {
        const lats = pts.map(p => p[0]); const lngs = pts.map(p => p[1]);
        if (nlat >= Math.min(...lats) && nlat <= Math.max(...lats) && nlng >= Math.min(...lngs) && nlng <= Math.max(...lngs)) {
            insideGeofence = true;
        }
    });

    if (insideGeofence) {
        if (!state.geofenceWarning) {
            state.geofenceWarning = true;
            speak("Warning. Entering Restricted Airspace.");
            setLog("WARNING: Restricted Airspace Breached!", "red");
            noLandingBadge.classList.remove('hidden');
            noLandingBadge.innerHTML = "<span class='warning-icon'>⛔</span> RESTRICTED AIRSPACE";
        }
    } else {
        state.geofenceWarning = false;
        noLandingBadge.classList.add('hidden');
    }

    state.droneLatLng = [nlat, nlng];
    droneMarker.setLatLng(state.droneLatLng);
    fpvCoord.textContent = `N: ${nlat.toFixed(4)} E: ${nlng.toFixed(4)}`;

    if (state.targetLatLng) {
        state.predictedPath = [state.droneLatLng, state.targetLatLng];
        predictedPolyline.setLatLngs(state.predictedPath);
    }

    const lastPoint = state.flightPath[state.flightPath.length - 1];
    const dist = Math.sqrt(Math.pow(nlat - lastPoint[0], 2) + Math.pow(nlng - lastPoint[1], 2)) * 111;
    state.totalDistance += dist;

    state.flightPath.push([nlat, nlng]);
    trailPolyline.setLatLngs(state.flightPath);
    map.panTo(state.droneLatLng, { animate: true });

    // Simulate Ghost Drone Movement randomly
    if (ghostMarkers.length === 2 && Math.random() > 0.5) {
        let [g1, g2] = ghostMarkers;
        g1.setLatLng([g1.getLatLng().lat + (Math.random() - 0.5) * 0.001, g1.getLatLng().lng + (Math.random() - 0.5) * 0.001]);
        g2.setLatLng([g2.getLatLng().lat + (Math.random() - 0.5) * 0.001, g2.getLatLng().lng + (Math.random() - 0.5) * 0.001]);
    }

    let cost = (state.weather === 'CLEAR') ? 1.0 : (state.weather === 'WIND' ? 2.5 : 4.0);
    state.battery -= cost;
    updateTelemetryUI();

    if (state.battery <= 0) {
        setLog("UPLINK LOST: Drone Crashed.", "red");
        statusBadge.textContent = "MISSION FAILED";
        statusBadge.classList.remove("hidden");
        speak("Mission failed. All signals lost.");
        fpvCamera.classList.add('hidden');
        stopSimulation();
    }

    const atHospital = state.hospitals.find(h => Math.abs(h.lat - nlat) < 0.0006 && Math.abs(h.lng - nlng) < 0.0006);

    let atTargetArea = false;
    if (!atHospital && state.targetLatLng) {
        let distToTarget = Math.sqrt(Math.pow(state.targetLatLng[0] - nlat, 2) + Math.pow(state.targetLatLng[1] - nlng, 2));
        if (distToTarget < 0.0006) atTargetArea = true;
    }

    if (atHospital || atTargetArea) {
        setLog("FACILITY LINK SECURED: Initiating Landing Sequence...", "green");

        if (atHospital) {
            state.droneLatLng = [atHospital.lat, atHospital.lng];
        } else {
            state.droneLatLng = [...state.targetLatLng];
        }

        droneMarker.setLatLng(state.droneLatLng);

        statusBadge.textContent = "MISSION SUCCESS: LANDED";
        statusBadge.classList.remove("hidden");
        speak("Destination reached. Landing sequence successful.");

        droneMarker.setOpacity(0.4);
        droneMarker.getElement().classList.add('drone-landed');
        fpvCamera.classList.add('hidden');

        stopSimulation();
    }
}

function initMission() {
    clearInterval(state.interval);
    state.playing = false;
    btnStart.textContent = "▶ Launch Delivery Sequence";
    btnStart.disabled = false;
    btnEmergency.disabled = true;
    statusBadge.classList.add("hidden");
    noLandingBadge.classList.add('hidden');
    criticalAlert.classList.add('hidden');
    fpvCamera.classList.add('hidden');
    speedBadge.innerHTML = `🚀 Speed: <b style="color:#fff">0 km/h</b>`; // Idle speed

    state.battery = 500.0;
    state.initialBattery = 500.0;
    state.totalDistance = 0;
    state.flightPath = [[state.droneLatLng[0], state.droneLatLng[1]]];
    trailPolyline.setLatLngs([]);
    predictedPolyline.setLatLngs([]);

    // Weather is now fetched in real-time. Just update UI here
    updateWeatherUI();

    if (state.hospitals.length === 0) {
        fetchRealHospitals(state.droneLatLng[0], state.droneLatLng[1]);
        fetchRealWeather(state.droneLatLng[0], state.droneLatLng[1]);
    }

    state.currentSerial = "SR-ALPHA";
    updateCargoUI();
    updateTelemetryUI();
    renderMapObjects();
}

function populateCargoGrid() {
    cargoSelectionGrid.innerHTML = '';
    MEDICAL_CARGOS.forEach((c, idx) => {
        const el = document.createElement('div');
        el.className = `cargo-option ${state.currentCargo.name === c.name ? 'selected' : ''}`;
        el.innerHTML = `
            <span class="c-opt-icon">${c.icon}</span>
            <div class="c-opt-details">
                <span class="c-opt-name">${c.name}</span>
                <span class="c-opt-meta">${c.type} | ${c.weight}</span>
            </div>
        `;
        el.onclick = () => {
            document.querySelectorAll('.cargo-option').forEach(n => n.classList.remove('selected'));
            el.classList.add('selected');
            state.currentCargo = c;
            updateCargoUI();
        };
        cargoSelectionGrid.appendChild(el);
    });
}

function updateCargoUI() {
    const c = state.currentCargo;
    cargoName.textContent = c.name;
    cargoType.textContent = c.type;
    cargoIcon.textContent = c.icon;
    cargoWeight.textContent = c.weight;
    cargoPriority.textContent = c.priority;

    cargoPriority.className = "priority-tag";
    if (c.priority === 'CRITICAL' || c.priority === 'HIGH') {
        cargoPriority.classList.add('priority-high');
        cargoIcon.style.filter = "drop-shadow(0 0 10px var(--acc-red))";
    } else {
        cargoIcon.style.filter = "none";
    }
}

function emergencyLanding() {
    if (!state.playing) return;

    setLog("EMERGENCY PROTOCOL: Landing Sequence Initiated.", "yellow");
    statusBadge.textContent = "EMERGENCY LANDING";
    statusBadge.classList.remove("hidden");
    speak("Danger. Emergency protocols initiated. Forced landing executed.");
    fpvCamera.classList.add('hidden');

    if (droneMarker && droneMarker.getElement()) {
        droneMarker.getElement().classList.add('drone-landed');
    }

    stopSimulation();
}

btnEmergency.addEventListener('click', emergencyLanding);

function stopSimulation() {
    clearInterval(state.interval);
    state.playing = false;
    btnStart.disabled = true;
    btnStart.classList.add('disabled');
    speedBadge.innerHTML = `🚀 Speed: <b style="color:#fff">0 km/h</b>`;

    if (state.missionStartTime) {
        let dur = Math.floor((Date.now() - state.missionStartTime) / 1000);
        let mins = Math.floor(dur / 60).toString().padStart(2, '0');
        let secs = (dur % 60).toString().padStart(2, '0');
        state.flightTimeStr = `${mins}:${secs}`;
    }

    if (state.targetLatLng && state.startLatLng) {
        let sd = Math.sqrt(Math.pow(state.targetLatLng[0] - state.startLatLng[0], 2) + Math.pow(state.targetLatLng[1] - state.startLatLng[1], 2)) * 111;
        state.targetDistStr = sd.toFixed(2) + " KM";
    }

    recordMissionToHistory();
    setTimeout(showMissionReview, 1500);
}

function recordMissionToHistory() {
    const now = new Date();
    const timeStr = now.getHours().toString().padStart(2, '0') + ":" + now.getMinutes().toString().padStart(2, '0');

    let destName = "Unknown Sector";
    if (state.targetLatLng) {
        const nearest = state.hospitals.reduce((prev, curr) => {
            const d1 = Math.abs(curr.lat - state.targetLatLng[0]) + Math.abs(curr.lng - state.targetLatLng[1]);
            const d2 = Math.abs(prev.lat - state.targetLatLng[0]) + Math.abs(prev.lng - state.targetLatLng[1]);
            return (d1 < d2) ? curr : prev;
        }, state.hospitals[0]);
        destName = nearest ? nearest.name : "Remote Grid";
    }

    const startLocName = citySearchInput.value || "Base Station";
    const startCoords = `${state.centerLatLng[0].toFixed(4)}, ${state.centerLatLng[1].toFixed(4)}`;
    const endCoords = `${state.droneLatLng[0].toFixed(4)}, ${state.droneLatLng[1].toFixed(4)}`;

    const batteryUsed = state.initialBattery - state.battery;
    const efficiency = (state.totalDistance / (batteryUsed || 1)) * 100;
    let grade = "C"; let color = "var(--acc-red)";
    if (efficiency > 2) { grade = "A+"; color = "var(--acc-green)"; }
    else if (efficiency > 1) { grade = "B"; color = "var(--acc-blue)"; }

    const record = {
        serial: state.currentSerial, time: timeStr, cargo: state.currentCargo.name,
        startLoc: startLocName, startCoords: startCoords, dest: destName, endCoords: endCoords,
        status: statusBadge.textContent,
        isWin: statusBadge.textContent.includes("SUCCESS") || statusBadge.textContent.includes("LANDING"),
        dist: state.totalDistance.toFixed(2) + " KM",
        flightTimeStr: state.flightTimeStr || "00:00",
        targetDistStr: state.targetDistStr || "0.0 KM",
        efficiency: Math.min(100, efficiency * 20),
        grade: grade,
        color: color
    };

    state.missionHistory.unshift(record);
    renderHistoryUI();
}

function renderHistoryUI() {
    if (state.missionHistory.length === 0) return;
    historyList.innerHTML = '';
    state.missionHistory.forEach((m, idx) => {
        const card = document.createElement('div');
        card.className = 'history-card';
        const stClass = m.isWin ? (m.status.includes("SUCCESS") ? 'status-win' : 'status-emergency') : 'status-fail';
        card.innerHTML = `
            <div class="h-header">
                <span class="h-serial">${m.serial}</span><span class="h-time">${m.time} LST</span>
            </div>
            <div class="h-body">
                Carried <b>${m.cargo}</b><br>
                <div style="margin-top:4px; font-size:9px; color:#94a3b8;">From: <b>${m.startLoc}</b> (${m.startCoords})<br>To: <b>${m.dest}</b> (${m.endCoords})</div>
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:6px;">
                <div class="h-status ${stClass}">${m.status}</div>
                <button class="btn-review-history" data-index="${idx}" style="background:var(--acc-blue); border:none; color:#fff; border-radius:3px; font-size:9px; font-weight:800; cursor:pointer; padding:3px 8px;">REVIEW</button>
            </div>
        `;
        historyList.appendChild(card);
    });

    document.querySelectorAll('.btn-review-history').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const idx = parseInt(e.target.getAttribute('data-index'));
            showMissionReview(idx);
        });
    });
}

function showMissionReview(historyIndex = 0) {
    state.currentReviewIndex = historyIndex; // Save context
    const rec = state.missionHistory[historyIndex];
    if (!rec) return;

    reviewStatus.textContent = rec.status;
    reviewDist.textContent = rec.dist;
    reviewTime.textContent = rec.flightTimeStr;
    reviewTrgtDist.textContent = rec.targetDistStr;

    reviewGrade.textContent = rec.grade;
    reviewGrade.style.background = rec.color;
    reviewGrade.style.boxShadow = `0 0 20px ${rec.color}`;
    reviewBatteryBar.style.width = rec.efficiency + "%";

    // Reset star rating UI or load saved rating
    let savedRating = rec.rating || 0;
    document.querySelectorAll('.star').forEach(s => {
        const sVal = parseInt(s.getAttribute('data-val'));
        if (sVal <= savedRating) {
            s.textContent = '★';
            s.style.color = '#facc15';
        } else {
            s.textContent = '☆';
            s.style.color = 'inherit';
        }
    });

    reviewModal.classList.remove('hidden');
}

// Star Rating Interaction
document.querySelectorAll('.star').forEach(star => {
    star.addEventListener('click', (e) => {
        const val = parseInt(e.target.getAttribute('data-val'));
        document.querySelectorAll('.star').forEach(s => {
            const sVal = parseInt(s.getAttribute('data-val'));
            if (sVal <= val) {
                s.textContent = '★';
                s.style.color = '#facc15'; // Gold color
            } else {
                s.textContent = '☆';
                s.style.color = 'inherit';
            }
        });

        if (state.currentReviewIndex !== undefined && state.missionHistory[state.currentReviewIndex]) {
            state.missionHistory[state.currentReviewIndex].rating = val;
            renderHistoryUI(); // Refresh history if needed
        }

        speak(`Performance rated ${val} out of 5 stars`);
        setLog(`Operator rated mission ${val} stars.`, "yellow");
    });
});

btnReviewCloseActual.addEventListener('click', () => reviewModal.classList.add('hidden'));

if (btnExportLogs) {
    btnExportLogs.addEventListener('click', () => {
        if (state.missionHistory.length === 0) return setLog("Export Failed: No Sorties Logged.", "red");

        let csvStr = "Serial,Time,Cargo,Start,Destination,Status,Path_Distance,Target_Distance,Flight_Time,Efficiency,Grade,AI_Rating\n";
        state.missionHistory.forEach(rec => {
            let ratingStr = rec.rating ? `${rec.rating} Stars` : "Unrated";
            csvStr += `${rec.serial},${rec.time},${rec.cargo},"${rec.startLoc}","${rec.dest}","${rec.status}",${rec.dist},${rec.targetDistStr},${rec.flightTimeStr},${rec.efficiency}%,${rec.grade},${ratingStr}\n`;
        });

        const blob = new Blob([csvStr], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `SkyRoute_Mission_Logs.csv`;
        a.click();
        URL.revokeObjectURL(url);
        speak("Mission logs exported successfully.");
        setLog("Fleet Logs completely downloaded.", "green");
    });
}

function setControlMode(mode) {
    state.controlMode = mode;
    modeAiBtn.classList.toggle('active', mode === 'AI');
    modeManualBtn.classList.toggle('active', mode === 'MANUAL');
    dpadControls.classList.toggle('hidden', mode === 'AI');
}

modeAiBtn.addEventListener('click', () => setControlMode('AI'));
modeManualBtn.addEventListener('click', () => setControlMode('MANUAL'));

// Hook into pre-flight Cargo Loading Phase
btnStart.addEventListener('click', () => {
    if (btnStart.disabled) return;
    if (!state.playing) {
        if (!state.targetLatLng) {
            setLog("Target sector not selected. Please lock destination first.", "yellow");
            speak("Target missing. Cannot authorize launch.");
            return;
        }
        populateCargoGrid();
        cargoModal.classList.remove('hidden');
    } else {
        state.playing = false;
        btnStart.textContent = "▶ Resume Link";
        clearInterval(state.interval);
    }
});

btnCancelCargo.addEventListener('click', () => cargoModal.classList.add('hidden'));

btnConfirmCargo.addEventListener('click', () => {
    cargoModal.classList.add('hidden');
    state.playing = true;
    state.missionStartTime = Date.now();
    state.startLatLng = [...state.droneLatLng];

    speak("Mission Authorized. Launch Sequence Started. Cargo locked.");
    btnStart.textContent = "⏸ Pause Link";
    btnEmergency.disabled = false;

    // Enable FPV Camera
    fpvCamera.classList.remove('hidden');

    if (state.controlMode === 'AI') {
        state.interval = setInterval(stepAISimulation, 1000);
    }
});

function getGridCoords(lat, lng) {
    const dx = Math.round((lat - state.centerLatLng[0]) / GRID_STEP) + 15;
    const dy = Math.round((lng - state.centerLatLng[1]) / GRID_STEP) + 15;
    return [Math.max(0, Math.min(29, dx)), Math.max(0, Math.min(29, dy))];
}

async function stepAISimulation() {
    if (!state.playing || !state.targetLatLng) return;

    const [dx, dy] = getGridCoords(state.droneLatLng[0], state.droneLatLng[1]);
    const [tx, ty] = getGridCoords(state.targetLatLng[0], state.targetLatLng[1]);

    setLog(`AI Pilot: Processing Grid Sector (${dx}, ${dy})...`, "yellow");

    try {
        const response = await fetch('http://localhost:5000/predict', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                drone_x: dx, drone_y: dy, target_x: tx, target_y: ty,
                battery: state.battery, urgency: state.currentCargo.urgency || 0.0
            })
        });

        const data = await response.json();
        if (data.action !== undefined) {
            let lat_move = 0, lng_move = 0;
            const step = GRID_STEP;
            if (data.action === 0) lat_move = -step;
            else if (data.action === 1) lat_move = step;
            else if (data.action === 2) lng_move = -step;
            else if (data.action === 3) lng_move = step;
            moveDrone(lat_move, lng_move);
        } else {
            setLog("AI Link Error: Model prediction failed.", "red");
        }
    } catch (e) {
        setLog("AI Link Offline: Ensure backend server is running on :5000", "red");
        let dlat = state.targetLatLng[0] - state.droneLatLng[0];
        let dlng = state.targetLatLng[1] - state.droneLatLng[1];
        const max_step = 0.0005;
        if (Math.abs(dlat) > max_step) dlat = (dlat > 0 ? max_step : -max_step);
        if (Math.abs(dlng) > max_step) dlng = (dlng > 0 ? max_step : -max_step);
        moveDrone(dlat, dlng);
    }
}

document.addEventListener('keydown', (e) => {
    if (state.controlMode === 'MANUAL' && state.playing) {
        const step = 0.0005;
        if (e.key === 'ArrowUp') moveDrone(step, 0);
        if (e.key === 'ArrowDown') moveDrone(-step, 0);
        if (e.key === 'ArrowLeft') moveDrone(0, -step);
        if (e.key === 'ArrowRight') moveDrone(0, step);
    }
});

// Swarm Fleet Click Handlers (Cosmetic interactions for simulated ghosts)
fleetAlpha.addEventListener('click', () => { speak("Swarm target locked. Controlling Alpha"); });
fleetBeta.addEventListener('click', () => { speak("Beta drone is on autonomous patrol. Override not available."); });
fleetGamma.addEventListener('click', () => { speak("Gamma drone is recharging. Override not available."); });

btnSearch.addEventListener('click', searchCity);
btnReset.addEventListener('click', initMission);
window.onload = () => { initMap(); initMission(); speak("Operations Console Online. System initializing."); };
