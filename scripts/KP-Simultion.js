/**
 * Detailed Solar Car Corridor: Pretoria Hub -> 45A Long St, Kempton Park
 * Total Waypoints: 36
 * Total Distance: ~52.1 km
 * Includes 3 Designated Pit Stops
 

const highResKemptonTrack = [
  // --- LEG 1: Pretoria Urban Exit (0.0 km -> 4.8 km) ---
  {
    step: 1,
    lat: -25.74790, lng: 28.22930,
    speed: 0, irr: 820, temp: 24.1, wind: 10, soc: 98.0,
    stop: false, road: "Pretoria Departure Paddock"
  },
  {
    step: 2,
    lat: -25.75380, lng: 28.22250,
    speed: 35, irr: 835, temp: 24.3, wind: 11, soc: 97.6,
    stop: false, road: "Nelson Mandela Dr (M3)"
  },
  {
    step: 3,
    lat: -25.76120, lng: 28.21740,
    speed: 48, irr: 840, temp: 24.4, wind: 12, soc: 97.1,
    stop: false, road: "Nelson Mandela Dr South"
  },
  {
    step: 4,
    lat: -25.76850, lng: 28.21390,
    speed: 25, irr: 850, temp: 24.6, wind: 12, soc: 96.8,
    stop: false, road: "Fountains Circle Approach"
  },
  // STOP 1: Fountains Valley Checkpoint (~4.8 km)
  {
    step: 5,
    lat: -25.77240, lng: 28.21180,
    speed: 0, irr: 875, temp: 24.8, wind: 11, soc: 97.0, // Recharges slightly while parked
    stop: true, stopName: "STOP 1: Fountains Valley Solar Inspection (10m pause)",
    road: "Fountains Valley Paddock"
  },

  // --- LEG 2: M18 Connector to R21 Highway (4.8 km -> 15.6 km) ---
  {
    step: 6,
    lat: -25.77950, lng: 28.21620,
    speed: 45, irr: 880, temp: 25.0, wind: 13, soc: 96.6,
    stop: false, road: "Christina de Wit Ave (M18)"
  },
  {
    step: 7,
    lat: -25.78680, lng: 28.22550,
    speed: 62, irr: 890, temp: 25.1, wind: 14, soc: 96.1,
    stop: false, road: "Eeufees Road Junction"
  },
  {
    step: 8,
    lat: -25.79420, lng: 28.23680,
    speed: 74, irr: 900, temp: 25.2, wind: 15, soc: 95.5,
    stop: false, road: "R21 Highway On-Ramp"
  },
  {
    step: 9,
    lat: -25.80510, lng: 28.24350,
    speed: 85, irr: 915, temp: 25.4, wind: 16, soc: 94.8,
    stop: false, road: "R21 Southbound (Waterkloof Ridge)"
  },
  {
    step: 10,
    lat: -25.81750, lng: 28.24820,
    speed: 88, irr: 920, temp: 25.6, wind: 16, soc: 94.1,
    stop: false, road: "R21 Southbound (Monument Park)"
  },
  {
    step: 11,
    lat: -25.83240, lng: 28.24980,
    speed: 90, irr: 930, temp: 25.7, wind: 17, soc: 93.4,
    stop: false, road: "R21 Southbound"
  },
  {
    step: 12,
    lat: -25.84850, lng: 28.24870,
    speed: 88, irr: 935, temp: 25.8, wind: 17, soc: 92.7,
    stop: false, road: "R21 South (Flying Saucer Interchange)"
  },
  {
    step: 13,
    lat: -25.85950, lng: 28.24710,
    speed: 50, irr: 940, temp: 25.9, wind: 15, soc: 92.3,
    stop: false, road: "Route 21 Corporate Park Exit"
  },
  // STOP 2: Irene / Route 21 Corporate Park (~16.2 km)
  {
    step: 14,
    lat: -25.86520, lng: 28.24490,
    speed: 0, irr: 960, temp: 26.1, wind: 13, soc: 92.8, // Parked charging boost
    stop: true, stopName: "STOP 2: Irene Mid-Route Thermal Check (15m pause)",
    road: "Route 21 Rest Oasis"
  },

  // --- LEG 3: Open Country Highway Sprint (16.2 km -> 36.8 km) ---
  {
    step: 15,
    lat: -25.87250, lng: 28.24620,
    speed: 65, irr: 955, temp: 26.2, wind: 16, soc: 92.4,
    stop: false, road: "R21 Re-entry Slipway"
  },
  {
    step: 16,
    lat: -25.88900, lng: 28.24700,
    speed: 90, irr: 950, temp: 26.3, wind: 17, soc: 91.7,
    stop: false, road: "R21 South (Open Fields)"
  },
  {
    step: 17,
    lat: -25.90800, lng: 28.24760,
    speed: 92, irr: 945, temp: 26.4, wind: 18, soc: 90.9,
    stop: false, road: "R21 South (Centurion East Border)"
  },
  {
    step: 18,
    lat: -25.92550, lng: 28.24810,
    speed: 92, irr: 940, temp: 26.5, wind: 18, soc: 90.1,
    stop: false, road: "Approaching Olifantsfontein"
  },
  {
    step: 19,
    lat: -25.94120, lng: 28.24850,
    speed: 86, irr: 935, temp: 26.5, wind: 17, soc: 89.4,
    stop: false, road: "Olifantsfontein (R562) Interchange"
  },
  {
    step: 20,
    lat: -25.95800, lng: 28.24920,
    speed: 90, irr: 930, temp: 26.6, wind: 17, soc: 88.6,
    stop: false, road: "R21 South (Clayville West)"
  },
  {
    step: 21,
    lat: -25.97500, lng: 28.25010,
    speed: 88, irr: 925, temp: 26.7, wind: 16, soc: 87.9,
    stop: false, road: "R21 Southbound"
  },
  {
    step: 22,
    lat: -25.99200, lng: 28.25100,
    speed: 88, irr: 920, temp: 26.8, wind: 16, soc: 87.2,
    stop: false, road: "Tembisa North Perimeter"
  },
  {
    step: 23,
    lat: -26.01100, lng: 28.25220,
    speed: 86, irr: 910, temp: 26.8, wind: 15, soc: 86.4,
    stop: false, road: "Tembisa East Bypass"
  },
  {
    step: 24,
    lat: -26.02800, lng: 28.25330,
    speed: 85, irr: 900, temp: 26.9, wind: 15, soc: 85.7,
    stop: false, road: "R21 Southbound"
  },
  {
    step: 25,
    lat: -26.04400, lng: 28.25430,
    speed: 82, irr: 890, temp: 27.0, wind: 14, soc: 85.0,
    stop: false, road: "R25 Bapsfontein Off-ramp Junction"
  },

  // --- LEG 4: Approaching Aerotropolis & Pomona (36.8 km -> 46.5 km) ---
  {
    step: 26,
    lat: -26.05900, lng: 28.25520,
    speed: 78, irr: 885, temp: 27.0, wind: 14, soc: 84.4,
    stop: false, road: "Bredell / R21 South"
  },
  {
    step: 27,
    lat: -26.06850, lng: 28.25580,
    speed: 45, irr: 875, temp: 27.1, wind: 13, soc: 84.0,
    stop: false, road: "Pomona Logistics Off-ramp"
  },
  // STOP 3: Pomona Staging Hub (~45.2 km)
  {
    step: 28,
    lat: -26.07410, lng: 28.25200,
    speed: 0, irr: 880, temp: 27.1, wind: 12, soc: 84.3, // Brief 5 min driver hydration
    stop: true, stopName: "STOP 3: Pomona Logistics Staging Area (5m pause)",
    road: "Pomona Depot"
  },

  // --- LEG 5: Kempton Park City Ingress to 45A Long St (46.5 km -> 52.1 km) ---
  {
    step: 29,
    lat: -26.08200, lng: 28.25100,
    speed: 55, irr: 865, temp: 27.2, wind: 12, soc: 83.9,
    stop: false, road: "Atlas Road (M43) Connector"
  },
  {
    step: 30,
    lat: -26.09150, lng: 28.24750,
    speed: 48, irr: 855, temp: 27.2, wind: 11, soc: 83.5,
    stop: false, road: "Voortrekker Rd Entry (M96)"
  },
  {
    step: 31,
    lat: -26.09680, lng: 28.24320,
    speed: 42, irr: 845, temp: 27.3, wind: 10, soc: 83.2,
    stop: false, road: "Voortrekker Rd (Kempton West)"
  },
  {
    step: 32,
    lat: -26.09980, lng: 28.24110,
    speed: 35, irr: 835, temp: 27.3, wind: 9, soc: 82.9,
    stop: false, road: "Pretoria Road Intersection"
  },
  {
    step: 33,
    lat: -26.10250, lng: 28.23920,
    speed: 30, irr: 825, temp: 27.4, wind: 8, soc: 82.6,
    stop: false, road: "Pretoria Road South"
  },
  {
    step: 34,
    lat: -26.10420, lng: 28.23860,
    speed: 25, irr: 820, temp: 27.4, wind: 8, soc: 82.4,
    stop: false, road: "Turning onto Long Street"
  },
  {
    step: 35,
    lat: -26.10550, lng: 28.23825,
    speed: 15, irr: 815, temp: 27.4, wind: 7, soc: 82.2,
    stop: false, road: "Long Street Approaching 45A"
  },
  // FINAL TERMINUS: 45A Long Street, Kempton Park
  {
    step: 36,
    lat: -26.10605, lng: 28.23812,
    speed: 0, irr: 810, temp: 27.5, wind: 7, soc: 82.1,
    stop: true, stopName: "🏁 FINAL DESTINATION: 45A Long Street, Kempton Park CBD",
    road: "45A Long Street"
  }
];

if (typeof module !== 'undefined' && module.exports) {
  module.exports = highResKemptonTrack;
}*/