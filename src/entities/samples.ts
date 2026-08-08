import { createEntity, createEmptyWorld } from './factory';
import type { World, TerraEntity } from './types';

export function createEarthWorld(): World {
  const world = createEmptyWorld('Real Earth');
  world.camera = {
    lon: 0,
    lat: 20,
    height: 14_000_000,
    heading: 0,
    pitch: -90,
  };

  const entities: TerraEntity[] = [
    // High-Detail North America
    createEntity({
      type: 'continent',
      name: 'North America',
      description: 'Home to mountain ranges, vast plains, the Great Lakes, and diverse ecosystems.',
      color: '#34d399',
      fillOpacity: 0.4,
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-168, 65],
            [-160, 58],
            [-148, 60],
            [-138, 56],
            [-128, 50],
            [-124, 48],
            [-122, 38],
            [-118, 32],
            [-115, 30],
            [-110, 24],
            [-106, 20],
            [-98, 25],
            [-97, 19],
            [-91, 15],
            [-83, 8],
            [-77, 8],
            [-80, 25],
            [-82, 30],
            [-80, 32],
            [-75, 35],
            [-74, 40],
            [-68, 44],
            [-64, 46],
            [-60, 48],
            [-64, 60],
            [-75, 62],
            [-80, 68],
            [-95, 62],
            [-105, 68],
            [-120, 70],
            [-140, 72],
            [-168, 65],
          ],
        ],
      },
      tags: ['earth', 'continent'],
    }),

    // High-Detail South America
    createEntity({
      type: 'continent',
      name: 'South America',
      description: 'Defined by the Amazon Rainforest, the Andes mountain range, and Patagonia.',
      color: '#10b981',
      fillOpacity: 0.4,
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-77, 8],
            [-72, 11],
            [-65, 10],
            [-58, 6],
            [-50, 4],
            [-42, -2],
            [-35, -5],
            [-38, -13],
            [-42, -20],
            [-48, -28],
            [-52, -34],
            [-58, -42],
            [-68, -55],
            [-72, -52],
            [-75, -45],
            [-72, -36],
            [-71, -26],
            [-78, -15],
            [-81, -4],
            [-80, 0],
            [-77, 8],
          ],
        ],
      },
      tags: ['earth', 'continent'],
    }),

    // High-Detail Europe
    createEntity({
      type: 'continent',
      name: 'Europe',
      description: 'Rich in cultural history, historic landmarks, Scandinavian fjords, and peninsulas.',
      color: '#60a5fa',
      fillOpacity: 0.4,
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-10, 36],
            [-9, 43],
            [-3, 43],
            [-1, 46],
            [3, 51],
            [5, 53],
            [8, 57],
            [10, 54],
            [12, 57],
            [8, 62],
            [12, 65],
            [18, 68],
            [28, 70],
            [32, 65],
            [40, 60],
            [40, 45],
            [36, 45],
            [30, 40],
            [26, 40],
            [23, 38],
            [18, 40],
            [15, 38],
            [12, 44],
            [3, 42],
            [-8, 36],
            [-10, 36],
          ],
        ],
      },
      tags: ['earth', 'continent'],
    }),

    // High-Detail British Isles
    createEntity({
      type: 'island',
      name: 'Great Britain & Ireland',
      description: 'Island group off the north-western coast of continental Europe.',
      color: '#38bdf8',
      fillOpacity: 0.45,
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-10, 51],
            [-6, 50],
            [-5, 54],
            [-1, 51],
            [1, 52],
            [0, 58],
            [-4, 58],
            [-7, 57],
            [-10, 54],
            [-10, 51],
          ],
        ],
      },
      tags: ['earth', 'island', 'europe'],
    }),

    // High-Detail Africa
    createEntity({
      type: 'continent',
      name: 'Africa',
      description: 'The cradle of humanity with vast deserts, savannas, and rift valleys.',
      color: '#fbbf24',
      fillOpacity: 0.4,
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-17, 32],
            [-5, 36],
            [0, 36],
            [11, 37],
            [25, 32],
            [33, 28],
            [35, 20],
            [42, 13],
            [51, 11],
            [46, 5],
            [40, -12],
            [35, -20],
            [33, -27],
            [26, -33],
            [18, -34],
            [15, -30],
            [12, -10],
            [8, 5],
            [-5, 5],
            [-14, 10],
            [-17, 21],
            [-17, 32],
          ],
        ],
      },
      tags: ['earth', 'continent'],
    }),

    // Madagascar
    createEntity({
      type: 'island',
      name: 'Madagascar',
      description: 'Large island nation off the southeastern coast of Africa.',
      color: '#f59e0b',
      fillOpacity: 0.45,
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [43, -12],
            [50, -13],
            [48, -25],
            [44, -25],
            [43, -12],
          ],
        ],
      },
      tags: ['earth', 'island', 'africa'],
    }),

    // High-Detail Asia
    createEntity({
      type: 'continent',
      name: 'Asia',
      description: 'Earth’s largest continent, stretching from the Ural Mountains to Japan and Indochina.',
      color: '#a78bfa',
      fillOpacity: 0.4,
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [40, 45],
            [40, 60],
            [55, 68],
            [60, 72],
            [90, 75],
            [140, 72],
            [170, 65],
            [160, 54],
            [140, 50],
            [130, 40],
            [120, 30],
            [115, 22],
            [108, 12],
            [100, 5],
            [98, 15],
            [88, 22],
            [80, 8],
            [72, 20],
            [60, 25],
            [55, 12],
            [45, 13],
            [35, 20],
            [35, 30],
            [40, 45],
          ],
        ],
      },
      tags: ['earth', 'continent'],
    }),

    // Japanese Archipelago
    createEntity({
      type: 'island',
      name: 'Japan Archipelago',
      description: 'Stratovolcanic archipelago in East Asia.',
      color: '#ec4899',
      fillOpacity: 0.45,
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [130, 31],
            [136, 34],
            [141, 42],
            [145, 45],
            [140, 45],
            [135, 38],
            [129, 33],
            [130, 31],
          ],
        ],
      },
      tags: ['earth', 'island', 'asia'],
    }),

    // High-Detail Australia
    createEntity({
      type: 'continent',
      name: 'Australia',
      description: 'Island continent famous for the Outback, Great Barrier Reef, and unique wildlife.',
      color: '#f97316',
      fillOpacity: 0.4,
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [114, -22],
            [122, -17],
            [130, -12],
            [136, -12],
            [142, -10],
            [146, -15],
            [150, -22],
            [153, -30],
            [148, -38],
            [138, -35],
            [128, -32],
            [115, -34],
            [113, -26],
            [114, -22],
          ],
        ],
      },
      tags: ['earth', 'continent'],
    }),

    // New Zealand
    createEntity({
      type: 'island',
      name: 'New Zealand',
      description: 'Island nation in the southwestern Pacific Ocean.',
      color: '#fb923c',
      fillOpacity: 0.45,
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [166, -46],
            [174, -39],
            [178, -35],
            [174, -41],
            [168, -46],
            [166, -46],
          ],
        ],
      },
      tags: ['earth', 'island', 'oceania'],
    }),

    // High-Detail Antarctica
    createEntity({
      type: 'continent',
      name: 'Antarctica',
      description: 'The southernmost continent, covered in massive ice sheets.',
      color: '#e2e8f0',
      fillOpacity: 0.4,
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-180, -68],
            [-140, -74],
            [-100, -72],
            [-60, -66],
            [-20, -70],
            [20, -68],
            [60, -67],
            [100, -66],
            [140, -68],
            [180, -68],
            [180, -89],
            [-180, -89],
            [-180, -68],
          ],
        ],
      },
      tags: ['earth', 'continent'],
    }),

    // World Cities (12 Major Capitals)
    createEntity({
      type: 'city',
      name: 'Tokyo',
      description: 'Capital of Japan and the world’s most populous metropolitan area.',
      color: '#ec4899',
      fillOpacity: 1,
      geometry: { type: 'Point', coordinates: [139.69, 35.68] },
      properties: { population: 14000000 },
      tags: ['capital', 'asia'],
    }),
    createEntity({
      type: 'city',
      name: 'London',
      description: 'Historic capital of the United Kingdom on the River Thames.',
      color: '#f43f5e',
      fillOpacity: 1,
      geometry: { type: 'Point', coordinates: [-0.12, 51.5] },
      properties: { population: 9000000 },
      tags: ['capital', 'europe'],
    }),
    createEntity({
      type: 'city',
      name: 'New York City',
      description: 'Global center of commerce, culture, and finance.',
      color: '#f43f5e',
      fillOpacity: 1,
      geometry: { type: 'Point', coordinates: [-74.0, 40.71] },
      properties: { population: 8400000 },
      tags: ['metropolis', 'north-america'],
    }),
    createEntity({
      type: 'city',
      name: 'Paris',
      description: 'Capital of France, renowned center of art, fashion, and culture.',
      color: '#a855f7',
      fillOpacity: 1,
      geometry: { type: 'Point', coordinates: [2.35, 48.85] },
      properties: { population: 2100000 },
      tags: ['capital', 'europe'],
    }),
    createEntity({
      type: 'city',
      name: 'Cairo',
      description: 'Ancient city near the Giza Pyramids on the Nile River.',
      color: '#f59e0b',
      fillOpacity: 1,
      geometry: { type: 'Point', coordinates: [31.23, 30.04] },
      properties: { population: 10000000 },
      tags: ['capital', 'africa'],
    }),
    createEntity({
      type: 'city',
      name: 'Sydney',
      description: 'Iconic harbor city known for the Opera House and Bondi Beach.',
      color: '#06b6d4',
      fillOpacity: 1,
      geometry: { type: 'Point', coordinates: [151.2, -33.86] },
      properties: { population: 5300000 },
      tags: ['australia'],
    }),
    createEntity({
      type: 'city',
      name: 'Rio de Janeiro',
      description: 'Famed Brazilian coastal city guarded by Christ the Redeemer.',
      color: '#10b981',
      fillOpacity: 1,
      geometry: { type: 'Point', coordinates: [-43.17, -22.9] },
      properties: { population: 6700000 },
      tags: ['south-america'],
    }),
    createEntity({
      type: 'city',
      name: 'Beijing',
      description: 'Capital of China, home to the Forbidden City and Great Wall.',
      color: '#ef4444',
      fillOpacity: 1,
      geometry: { type: 'Point', coordinates: [116.4, 39.9] },
      properties: { population: 21800000 },
      tags: ['capital', 'asia'],
    }),
    createEntity({
      type: 'city',
      name: 'New Delhi',
      description: 'Capital of India, bustling metropolis with deep historical roots.',
      color: '#f97316',
      fillOpacity: 1,
      geometry: { type: 'Point', coordinates: [77.2, 28.61] },
      properties: { population: 32000000 },
      tags: ['capital', 'asia'],
    }),
    createEntity({
      type: 'city',
      name: 'Moscow',
      description: 'Capital of Russia, known for the Red Square and Kremlin towers.',
      color: '#3b82f6',
      fillOpacity: 1,
      geometry: { type: 'Point', coordinates: [37.61, 55.75] },
      properties: { population: 13000000 },
      tags: ['capital', 'europe'],
    }),
    createEntity({
      type: 'city',
      name: 'Cape Town',
      description: 'Port city on South Africa’s southwest coast beneath Table Mountain.',
      color: '#eab308',
      fillOpacity: 1,
      geometry: { type: 'Point', coordinates: [18.42, -33.92] },
      properties: { population: 4600000 },
      tags: ['africa'],
    }),
    createEntity({
      type: 'city',
      name: 'Mexico City',
      description: 'High-altitude capital built on the ruins of Tenochtitlan.',
      color: '#14b8a6',
      fillOpacity: 1,
      geometry: { type: 'Point', coordinates: [-99.13, 19.43] },
      properties: { population: 9200000, pinIcon: 'capital', pinStyle: 'teardrop' },
      tags: ['capital', 'north-america'],
    }),

    // Iconic Real Earth Landmarks & World Wonders
    createEntity({
      type: 'landmark',
      name: 'Mount Everest',
      description: 'Earth’s highest mountain above sea level, located in the Mahalangur Himal sub-range of the Himalayas.',
      color: '#06b6d4',
      fillOpacity: 1,
      geometry: { type: 'Point', coordinates: [86.925, 27.988] },
      properties: { pinIcon: 'mountain', pinStyle: 'beacon', pinHeight: 8848, elevation: '8,848 m' },
      tags: ['wonder', 'mountain', 'himalayas', 'asia'],
    }),
    createEntity({
      type: 'landmark',
      name: 'Eiffel Tower',
      description: 'Wrought-iron lattice tower on the Champ de Mars in Paris, France.',
      color: '#f59e0b',
      fillOpacity: 1,
      geometry: { type: 'Point', coordinates: [2.2945, 48.8584] },
      properties: { pinIcon: 'landmark', pinStyle: 'teardrop', pinHeight: 330, height: '330 m' },
      tags: ['wonder', 'monument', 'paris', 'europe'],
    }),
    createEntity({
      type: 'landmark',
      name: 'Pyramids of Giza',
      description: 'Ancient royal tombs built during Egypt’s Old Kingdom, guarding Cairo on the Nile.',
      color: '#d97706',
      fillOpacity: 1,
      geometry: { type: 'Point', coordinates: [31.1342, 29.9792] },
      properties: { pinIcon: 'landmark', pinStyle: 'pushpin', pinHeight: 140, age: '4,500 years' },
      tags: ['wonder', 'ancient', 'egypt', 'africa'],
    }),
    createEntity({
      type: 'landmark',
      name: 'Great Wall of China',
      description: 'Vast ancient fortification system stretching thousands of miles across northern China.',
      color: '#ef4444',
      fillOpacity: 1,
      geometry: { type: 'Point', coordinates: [116.57, 40.43] },
      properties: { pinIcon: 'castle', pinStyle: 'flag', pinHeight: 200, length: '21,196 km' },
      tags: ['wonder', 'ancient', 'china', 'asia'],
    }),
    createEntity({
      type: 'landmark',
      name: 'Statue of Liberty',
      description: 'Colossal neoclassical sculpture on Liberty Island in New York Harbor.',
      color: '#10b981',
      fillOpacity: 1,
      geometry: { type: 'Point', coordinates: [-74.0445, 40.6892] },
      properties: { pinIcon: 'landmark', pinStyle: 'teardrop', pinHeight: 93, height: '93 m' },
      tags: ['wonder', 'monument', 'nyc', 'north-america'],
    }),
    createEntity({
      type: 'landmark',
      name: 'Colosseum',
      description: 'Immense oval amphitheatre in the centre of Rome, Italy.',
      color: '#f97316',
      fillOpacity: 1,
      geometry: { type: 'Point', coordinates: [12.4922, 41.8902] },
      properties: { pinIcon: 'landmark', pinStyle: 'pushpin', pinHeight: 50 },
      tags: ['wonder', 'ancient', 'rome', 'europe'],
    }),
    createEntity({
      type: 'landmark',
      name: 'Taj Mahal',
      description: 'Ivory-white marble mausoleum on the right bank of the Yamuna River in Agra, India.',
      color: '#f8fafc',
      fillOpacity: 1,
      geometry: { type: 'Point', coordinates: [78.0421, 27.1751] },
      properties: { pinIcon: 'landmark', pinStyle: 'teardrop', pinHeight: 73 },
      tags: ['wonder', 'india', 'asia'],
    }),
    createEntity({
      type: 'landmark',
      name: 'Sydney Opera House',
      description: 'Multi-venue performing arts centre in Sydney Harbour, Australia.',
      color: '#38bdf8',
      fillOpacity: 1,
      geometry: { type: 'Point', coordinates: [151.2153, -33.8568] },
      properties: { pinIcon: 'landmark', pinStyle: 'teardrop', pinHeight: 65 },
      tags: ['wonder', 'sydney', 'australia'],
    }),
    createEntity({
      type: 'landmark',
      name: 'Grand Canyon',
      description: 'Immense steep-sided canyon carved by the Colorado River in Arizona, USA.',
      color: '#ea580c',
      fillOpacity: 1,
      geometry: { type: 'Point', coordinates: [-112.1129, 36.1069] },
      properties: { pinIcon: 'nature', pinStyle: 'beacon', pinHeight: 1800, depth: '1,800 m' },
      tags: ['nature', 'canyon', 'arizona', 'north-america'],
    }),
    createEntity({
      type: 'landmark',
      name: 'Machu Picchu',
      description: '15th-century Inca citadel set high in the Andes Mountains of Peru.',
      color: '#84cc16',
      fillOpacity: 1,
      geometry: { type: 'Point', coordinates: [-72.545, -13.1631] },
      properties: { pinIcon: 'castle', pinStyle: 'flag', pinHeight: 2430, elevation: '2,430 m' },
      tags: ['wonder', 'inca', 'peru', 'south-america'],
    }),
    createEntity({
      type: 'landmark',
      name: 'Christ the Redeemer',
      description: 'Art Deco statue of Jesus Christ crowning Mount Corcovado in Rio de Janeiro.',
      color: '#a855f7',
      fillOpacity: 1,
      geometry: { type: 'Point', coordinates: [-43.2105, -22.9519] },
      properties: { pinIcon: 'landmark', pinStyle: 'teardrop', pinHeight: 700 },
      tags: ['monument', 'rio', 'south-america'],
    }),
    createEntity({
      type: 'landmark',
      name: 'Tokyo Skytree',
      description: 'Broadcasting and observation tower in Sumida, Tokyo, Japan.',
      color: '#ec4899',
      fillOpacity: 1,
      geometry: { type: 'Point', coordinates: [139.8107, 35.7101] },
      properties: { pinIcon: 'city', pinStyle: 'teardrop', pinHeight: 634, height: '634 m' },
      tags: ['tower', 'tokyo', 'asia'],
    }),
    createEntity({
      type: 'landmark',
      name: 'Mount Fuji',
      description: 'Japan’s highest mountain and active volcano, iconic for its snow-capped cone.',
      color: '#e2e8f0',
      fillOpacity: 1,
      geometry: { type: 'Point', coordinates: [138.7278, 35.3606] },
      properties: { pinIcon: 'mountain', pinStyle: 'beacon', pinHeight: 3776, elevation: '3,776 m' },
      tags: ['mountain', 'volcano', 'japan', 'asia'],
    }),
    createEntity({
      type: 'landmark',
      name: 'Burj Khalifa',
      description: 'World’s tallest building, soaring over Downtown Dubai, UAE.',
      color: '#38bdf8',
      fillOpacity: 1,
      geometry: { type: 'Point', coordinates: [55.2744, 25.1972] },
      properties: { pinIcon: 'city', pinStyle: 'teardrop', pinHeight: 828, height: '828 m' },
      tags: ['skyscraper', 'dubai', 'asia'],
    }),
    createEntity({
      type: 'landmark',
      name: 'Victoria Falls',
      description: 'Massive waterfall on the Zambezi River on the border between Zambia and Zimbabwe.',
      color: '#06b6d4',
      fillOpacity: 1,
      geometry: { type: 'Point', coordinates: [25.8572, -17.9244] },
      properties: { pinIcon: 'nature', pinStyle: 'beacon', pinHeight: 108 },
      tags: ['waterfall', 'africa'],
    }),
    createEntity({
      type: 'landmark',
      name: 'Golden Gate Bridge',
      description: 'Iconic orange-red suspension bridge spanning the Golden Gate Strait in San Francisco.',
      color: '#f97316',
      fillOpacity: 1,
      geometry: { type: 'Point', coordinates: [-122.4783, 37.8199] },
      properties: { pinIcon: 'camera', pinStyle: 'teardrop', pinHeight: 227 },
      tags: ['bridge', 'san-francisco', 'north-america'],
    }),
    createEntity({
      type: 'landmark',
      name: 'Moai of Easter Island',
      description: 'Monolithic human figures carved by the Rapa Nui people on Easter Island, Chile.',
      color: '#71717a',
      fillOpacity: 1,
      geometry: { type: 'Point', coordinates: [-109.3497, -27.1127] },
      properties: { pinIcon: 'landmark', pinStyle: 'pushpin', pinHeight: 20 },
      tags: ['ancient', 'island', 'chile'],
    }),
    createEntity({
      type: 'landmark',
      name: 'Matterhorn',
      description: 'Iconic pyramid-shaped mountain peak in the Pennine Alps on the Swiss-Italian border.',
      color: '#94a3b8',
      fillOpacity: 1,
      geometry: { type: 'Point', coordinates: [7.6586, 45.9765] },
      properties: { pinIcon: 'mountain', pinStyle: 'beacon', pinHeight: 4478, elevation: '4,478 m' },
      tags: ['mountain', 'alps', 'europe'],
    }),
  ];

  for (const entity of entities) {
    world.entities[entity.id] = entity;
  }
  return world;
}

export function createMiddleEarthWorld(): World {
  const world = createEmptyWorld('Middle-earth (Arda)');
  world.camera = {
    lon: 0,
    lat: 22,
    height: 9_000_000,
    heading: 0,
    pitch: -90,
  };

  const gondorId = '01MIDDLEEARTHGOND00000000';
  const mordorId = '01MIDDLEEARTHMORD00000000';
  const rohanId = '01MIDDLEEARTHROHA00000000';
  const eriadorId = '01MIDDLEEARTHERIA00000000';
  const rhovanionId = '01MIDDLEEARTHRHOV00000000';

  const entities: TerraEntity[] = [
    // ----------------------------------------------------
    // ORGANIC REALM BOUNDARIES
    // ----------------------------------------------------

    // Detailed Gondor & Coastal Realms
    createEntity({
      type: 'region',
      name: 'Gondor & Coastal Realms',
      description: 'The noble kingdom of Men, guarded by the White Mountains, Belfalas coastline, Anfalas, Pelargir, and Ithilien along the River Anduin.',
      color: '#64748b',
      fillOpacity: 0.8,
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-28, -8],
            [-24, -12],
            [-18, -10],
            [-14, -14],
            [-8, -12],
            [-2, -8],
            [4, -6],
            [10, -4],
            [14, -2],
            [17, 3],
            [16, 11],
            [11, 10],
            [5, 9],
            [0, 10],
            [-6, 11],
            [-12, 10],
            [-18, 7],
            [-24, 2],
            [-28, -8],
          ],
        ],
      },
      properties: { biome: 'satellite-blend', extrudedHeight: 0 },
      tags: ['middle-earth', 'realm', 'gondor'],
    }),

    // Detailed Mordor (The Black Land)
    createEntity({
      type: 'region',
      name: 'Mordor (The Black Land)',
      description: 'Ringed by the Ephel Dúath and Ered Lithui, containing Mount Doom, Gorgoroth ash plains, Barad-dûr, and the Sea of Núrnen.',
      color: '#dc2626',
      fillOpacity: 0.85,
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [17, 3],
            [22, 2],
            [28, 1],
            [36, 1],
            [44, 4],
            [42, 12],
            [38, 17],
            [30, 17],
            [22, 16],
            [17, 15],
            [16, 9],
            [17, 3],
          ],
        ],
      },
      properties: { biome: 'volcanic-ash', extrudedHeight: 0 },
      tags: ['middle-earth', 'realm', 'mordor'],
    }),

    // Detailed Rohan (Plains of the Horse-Lords)
    createEntity({
      type: 'region',
      name: 'Rohan (Plains of the Horse-Lords)',
      description: 'Vast fertile grasslands of the Rohirrim stretching from the Gap of Rohan to Edoras, Meduseld, and the Entwash.',
      color: '#84cc16',
      fillOpacity: 0.8,
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-15, 12],
            [-9, 12],
            [0, 10],
            [5, 9],
            [11, 10],
            [16, 11],
            [15, 23],
            [8, 24],
            [1, 25],
            [-8, 24],
            [-15, 12],
          ],
        ],
      },
      properties: { biome: 'lush-grassland', extrudedHeight: 0 },
      tags: ['middle-earth', 'realm', 'rohan'],
    }),

    // Detailed Eriador & Westlands
    createEntity({
      type: 'region',
      name: 'Eriador & Westlands',
      description: 'Sprawling western realm containing The Shire, Bree, Rivendell, Eregion, Weather Hills, and Dunland.',
      color: '#10b981',
      fillOpacity: 0.8,
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-45, 15],
            [-35, 14],
            [-25, 13],
            [-15, 12],
            [-8, 24],
            [-12, 38],
            [-18, 44],
            [-28, 46],
            [-38, 45],
            [-46, 38],
            [-48, 30],
            [-45, 15],
          ],
        ],
      },
      properties: { biome: 'satellite-blend', extrudedHeight: 0 },
      tags: ['middle-earth', 'region', 'eriador'],
    }),

    // Detailed Rhovanion (Wilderland)
    createEntity({
      type: 'region',
      name: 'Rhovanion (Wilderland)',
      description: 'Vast eastern domain encompassing Mirkwood, Erebor, Dale, Esgaroth, Iron Hills, and the Long Lake.',
      color: '#059669',
      fillOpacity: 0.8,
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [15, 23],
            [22, 16],
            [30, 17],
            [38, 17],
            [48, 28],
            [46, 42],
            [42, 48],
            [28, 48],
            [18, 48],
            [12, 38],
            [15, 23],
          ],
        ],
      },
      properties: { biome: 'forest-canopy', extrudedHeight: 0 },
      tags: ['middle-earth', 'region', 'rhovanion'],
    }),

    // Lindon & Grey Havens Coast
    createEntity({
      type: 'region',
      name: 'Lindon & Grey Havens',
      description: 'Ancient coastal realm of the High Elves bordering the Great Sea, split by the Gulf of Lhûn.',
      color: '#38bdf8',
      fillOpacity: 0.55,
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-65, 18],
            [-52, 16],
            [-45, 15],
            [-48, 30],
            [-46, 38],
            [-38, 45],
            [-52, 46],
            [-60, 42],
            [-66, 35],
            [-65, 18],
          ],
        ],
      },
      properties: { biome: 'elven-azure', extrudedHeight: 0 },
      tags: ['middle-earth', 'elven', 'sea'],
    }),

    // Near Harad & Haradwaith Deserts
    createEntity({
      type: 'region',
      name: 'Near Harad & Haradwaith',
      description: 'Sun-scorched golden dunes and coastal havens of the Haradrim.',
      color: '#eab308',
      fillOpacity: 0.5,
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-28, -8],
            [-18, -10],
            [-8, -12],
            [4, -6],
            [17, 3],
            [36, 1],
            [44, -12],
            [25, -22],
            [-10, -20],
            [-28, -8],
          ],
        ],
      },
      properties: { biome: 'desert-dunes', extrudedHeight: 0 },
      tags: ['middle-earth', 'harad', 'desert'],
    }),

    // ----------------------------------------------------
    // 3D MOUNTAIN RANGES & CHAINS (Extruded 3D Plateaus)
    // ----------------------------------------------------

    // Misty Mountains (Hitaeglir)
    createEntity({
      type: 'region',
      name: 'Misty Mountains (Hitaeglir)',
      description: 'Great mountain chain running north to south across Eriador and Wilderland, holding Khazad-dûm (Moria) and Mount Gundabad.',
      color: '#cbd5e1',
      fillOpacity: 0.7,
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-14, 18],
            [-10, 24],
            [-12, 34],
            [-16, 42],
            [-11, 43],
            [-7, 34],
            [-5, 24],
            [-9, 18],
            [-14, 18],
          ],
        ],
      },
      properties: { biome: 'mountain-slate', extrudedHeight: 95000 },
      tags: ['middle-earth', 'mountain', 'misty-mountains'],
    }),

    // White Mountains (Ered Nimrais)
    createEntity({
      type: 'region',
      name: 'White Mountains (Ered Nimrais)',
      description: 'Glacial snow-capped mountain ridge forming the border between Gondor and Rohan.',
      color: '#e2e8f0',
      fillOpacity: 0.7,
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-14, 11],
            [-6, 10],
            [2, 9],
            [10, 9],
            [15, 6],
            [15, 2],
            [8, 5],
            [0, 6],
            [-8, 7],
            [-14, 11],
          ],
        ],
      },
      properties: { biome: 'mountain-slate', extrudedHeight: 88000 },
      tags: ['middle-earth', 'mountain', 'white-mountains'],
    }),

    // Ephel Dúath (Mountains of Shadow)
    createEntity({
      type: 'region',
      name: 'Ephel Dúath (Shadow Mountains)',
      description: 'Western and southern jagged mountain wall protecting Mordor.',
      color: '#334155',
      fillOpacity: 0.8,
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [16, 3],
            [18, 3],
            [17, 15],
            [24, 15],
            [24, 13],
            [19, 13],
            [18, 5],
            [16, 3],
          ],
        ],
      },
      properties: { biome: 'volcanic-ash', extrudedHeight: 90000 },
      tags: ['middle-earth', 'mountain', 'mordor'],
    }),

    // Ered Lithui (Ash Mountains)
    createEntity({
      type: 'region',
      name: 'Ered Lithui (Ash Mountains)',
      description: 'Northern ash-covered mountain wall guarding Mordor.',
      color: '#475569',
      fillOpacity: 0.8,
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [17, 15],
            [30, 17],
            [40, 16],
            [40, 14],
            [30, 15],
            [17, 13],
            [17, 15],
          ],
        ],
      },
      properties: { biome: 'volcanic-ash', extrudedHeight: 85000 },
      tags: ['middle-earth', 'mountain', 'mordor'],
    }),

    // ----------------------------------------------------
    // ANCIENT FORESTS & LORE LANDMARKS
    // ----------------------------------------------------

    // Mirkwood (Greenwood the Great)
    createEntity({
      type: 'region',
      name: 'Mirkwood (Greenwood the Great)',
      description: 'Vast ancient forest realm of Thranduil’s Wood Elves, shadowed by Dol Guldur in the south.',
      color: '#047857',
      fillOpacity: 0.65,
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [16, 26],
            [26, 25],
            [32, 28],
            [34, 38],
            [28, 44],
            [18, 42],
            [16, 32],
            [16, 26],
          ],
        ],
      },
      properties: { biome: 'forest-canopy', extrudedHeight: 0 },
      tags: ['middle-earth', 'forest', 'elven'],
    }),

    // Lothlórien (Golden Wood)
    createEntity({
      type: 'region',
      name: 'Lothlórien (Golden Wood)',
      description: 'Enchanted realm of Galadriel and Celeborn, renowned for golden Mallorn trees and the Mirror of Galadriel.',
      color: '#eab308',
      fillOpacity: 0.65,
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-6, 22],
            [0, 21],
            [3, 25],
            [-3, 26],
            [-6, 22],
          ],
        ],
      },
      properties: { biome: 'forest-canopy', extrudedHeight: 0 },
      tags: ['middle-earth', 'forest', 'galadriel'],
    }),

    // Fangorn Forest
    createEntity({
      type: 'region',
      name: 'Fangorn Forest',
      description: 'Ancient primordial forest home of Treebeard and the Ents beneath the Misty Mountains.',
      color: '#15803d',
      fillOpacity: 0.65,
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-12, 17],
            [-6, 17],
            [-4, 21],
            [-10, 22],
            [-12, 17],
          ],
        ],
      },
      properties: { biome: 'forest-canopy', extrudedHeight: 0 },
      tags: ['middle-earth', 'forest', 'ents'],
    }),

    // ----------------------------------------------------
    // CANONICAL CITIES, FORTRESSES & LANDMARKS (20+ Points)
    // ----------------------------------------------------

    createEntity({
      type: 'city',
      name: 'Minas Tirith',
      description: 'Citadel of Gondor with 7 concentric 3D walls, the White Tree, and Tower of Ecthelion.',
      color: '#f8fafc',
      fillOpacity: 1,
      parentId: gondorId,
      geometry: { type: 'Point', coordinates: [14, 6] },
      properties: { pinIcon: 'capital', pinStyle: 'teardrop', pinHeight: 320 },
      tags: ['gondor', 'citadel', 'capital'],
    }),
    createEntity({
      type: 'landmark',
      name: 'Barad-dûr (Dark Tower)',
      description: 'Fortress of Sauron, soaring 1,400 meters over Gorgoroth with the Lidless Eye.',
      color: '#dc2626',
      fillOpacity: 1,
      parentId: mordorId,
      geometry: { type: 'Point', coordinates: [28, 10] },
      properties: { pinIcon: 'landmark', pinStyle: 'beacon', pinHeight: 1400 },
      tags: ['mordor', 'sauron', 'dark-tower'],
    }),
    createEntity({
      type: 'landmark',
      name: 'Mount Doom (Orodruin)',
      description: 'Active volcano in Mordor where the One Ring was forged in the Second Age.',
      color: '#f97316',
      fillOpacity: 1,
      parentId: mordorId,
      geometry: { type: 'Point', coordinates: [24, 10] },
      properties: { pinIcon: 'mountain', pinStyle: 'beacon', pinHeight: 3000 },
      tags: ['mordor', 'volcano', 'fire'],
    }),
    createEntity({
      type: 'landmark',
      name: 'Isengard (Orthanc)',
      description: 'Ring of stone enclosing the black obsidian tower of Saruman the White.',
      color: '#64748b',
      fillOpacity: 1,
      geometry: { type: 'Point', coordinates: [-13, 17] },
      properties: { pinIcon: 'castle', pinStyle: 'flag', pinHeight: 450 },
      tags: ['isengard', 'wizard', 'tower'],
    }),
    createEntity({
      type: 'landmark',
      name: 'Helm’s Deep (Hornburg)',
      description: 'Impregnable mountain fortress of Rohan in the Ered Nimrais.',
      color: '#a1a1aa',
      fillOpacity: 1,
      parentId: rohanId,
      geometry: { type: 'Point', coordinates: [-7, 14] },
      properties: { pinIcon: 'castle', pinStyle: 'teardrop', pinHeight: 280 },
      tags: ['rohan', 'fortress'],
    }),
    createEntity({
      type: 'town',
      name: 'Rivendell (Imladris)',
      description: 'The Last Homely House East of the Sea, hidden elven sanctuary of Lord Elrond.',
      color: '#38bdf8',
      fillOpacity: 1,
      parentId: eriadorId,
      geometry: { type: 'Point', coordinates: [-16, 32] },
      properties: { pinIcon: 'capital', pinStyle: 'teardrop', pinHeight: 150 },
      tags: ['elven', 'sanctuary'],
    }),
    createEntity({
      type: 'town',
      name: 'Hobbiton & Bag End',
      description: 'Rolling green hobbit mounds, round doors, and peaceful country of The Shire.',
      color: '#22c55e',
      fillOpacity: 1,
      parentId: eriadorId,
      geometry: { type: 'Point', coordinates: [-30, 26] },
      properties: { pinIcon: 'nature', pinStyle: 'pushpin' },
      tags: ['shire', 'hobbit'],
    }),
    createEntity({
      type: 'city',
      name: 'Edoras',
      description: 'Capital of Rohan atop a green hill, housing the Golden Hall of Meduseld.',
      color: '#eab308',
      fillOpacity: 1,
      parentId: rohanId,
      geometry: { type: 'Point', coordinates: [-2, 15] },
      properties: { pinIcon: 'city', pinStyle: 'teardrop' },
      tags: ['rohan', 'capital'],
    }),
    createEntity({
      type: 'city',
      name: 'Erebor (The Lonely Mountain)',
      description: 'Dwarven mountain kingdom of Durin’s Folk rich in gold and the Arkenstone.',
      color: '#fbbf24',
      fillOpacity: 1,
      parentId: rhovanionId,
      geometry: { type: 'Point', coordinates: [32, 42] },
      properties: { pinIcon: 'mountain', pinStyle: 'flag', pinHeight: 800 },
      tags: ['dwarven', 'mountain', 'lonely-mountain'],
    }),
    createEntity({
      type: 'landmark',
      name: 'Moria (Khazad-dûm)',
      description: 'Ancient subterranean dwarf city under the Misty Mountains, haunted by the Balrog.',
      color: '#94a3b8',
      fillOpacity: 1,
      geometry: { type: 'Point', coordinates: [-10, 28] },
      properties: { pinIcon: 'castle', pinStyle: 'teardrop', pinHeight: 500 },
      tags: ['dwarven', 'underground', 'balrog'],
    }),
    createEntity({
      type: 'landmark',
      name: 'Argonath (Pillars of the Kings)',
      description: 'Giant stone colossi of Isildur and Anárion straddling the River Anduin.',
      color: '#f59e0b',
      fillOpacity: 1,
      geometry: { type: 'Point', coordinates: [8, 12] },
      properties: { pinIcon: 'landmark', pinStyle: 'beacon', pinHeight: 480 },
      tags: ['gondor', 'monument', 'anduin'],
    }),
    createEntity({
      type: 'landmark',
      name: 'Minas Morgul',
      description: 'Sorcerous phantom citadel of the Witch-king glowing with green witch-light.',
      color: '#10b981',
      fillOpacity: 1,
      parentId: mordorId,
      geometry: { type: 'Point', coordinates: [16, 7] },
      properties: { pinIcon: 'castle', pinStyle: 'beacon', pinHeight: 450 },
      tags: ['nazgul', 'mordor', 'citadel'],
    }),
    createEntity({
      type: 'landmark',
      name: 'Cirith Ungol',
      description: 'High mountain watchtower guarding the spider pass above Minas Morgul.',
      color: '#71717a',
      fillOpacity: 1,
      parentId: mordorId,
      geometry: { type: 'Point', coordinates: [18, 9] },
      properties: { pinIcon: 'castle', pinStyle: 'pushpin', pinHeight: 300 },
      tags: ['mordor', 'tower', 'shelob'],
    }),
    createEntity({
      type: 'city',
      name: 'Osgiliath',
      description: 'Ancient capital of Gondor straddling the Anduin, now a contested fortress ruin.',
      color: '#94a3b8',
      fillOpacity: 1,
      parentId: gondorId,
      geometry: { type: 'Point', coordinates: [15, 7] },
      properties: { pinIcon: 'landmark', pinStyle: 'teardrop' },
      tags: ['gondor', 'ruins'],
    }),
    createEntity({
      type: 'town',
      name: 'Bree',
      description: 'Historic village of Men and Hobbits at the crossroads of the Great East Road.',
      color: '#f97316',
      fillOpacity: 1,
      parentId: eriadorId,
      geometry: { type: 'Point', coordinates: [-22, 29] },
      properties: { pinIcon: 'city', pinStyle: 'teardrop' },
      tags: ['bree', 'inn'],
    }),
    createEntity({
      type: 'town',
      name: 'Mithlond (Grey Havens)',
      description: 'Elven haven on the Gulf of Lhûn where white ships sail for the Undying Lands.',
      color: '#38bdf8',
      fillOpacity: 1,
      geometry: { type: 'Point', coordinates: [-44, 28] },
      properties: { pinIcon: 'port', pinStyle: 'teardrop' },
      tags: ['elven', 'port', 'ships'],
    }),
    createEntity({
      type: 'city',
      name: 'Umbar (Haven of Corsairs)',
      description: 'Fortified pirate harbor and stronghold of the Corsairs in the south.',
      color: '#eab308',
      fillOpacity: 1,
      geometry: { type: 'Point', coordinates: [-22, -14] },
      properties: { pinIcon: 'port', pinStyle: 'flag' },
      tags: ['corsairs', 'harbor'],
    }),
    createEntity({
      type: 'landmark',
      name: 'Dol Guldur',
      description: 'The Hill of Sorcery in Southern Mirkwood, former stronghold of the Necromancer.',
      color: '#991b1b',
      fillOpacity: 1,
      geometry: { type: 'Point', coordinates: [20, 24] },
      properties: { pinIcon: 'castle', pinStyle: 'beacon', pinHeight: 250 },
      tags: ['shadow', 'mirkwood'],
    }),
    createEntity({
      type: 'landmark',
      name: 'Dead Marshes',
      description: 'Ghostly bogs where spectral faces flicker beneath the murky waters.',
      color: '#06b6d4',
      fillOpacity: 1,
      geometry: { type: 'Point', coordinates: [14, 14] },
      properties: { pinIcon: 'nature', pinStyle: 'dot' },
      tags: ['marshes', 'ghosts'],
    }),
    createEntity({
      type: 'landmark',
      name: 'Weathertop (Amon Sûl)',
      description: 'Ruined watchtower on the highest hill of the Weather Hills.',
      color: '#a855f7',
      fillOpacity: 1,
      parentId: eriadorId,
      geometry: { type: 'Point', coordinates: [-18, 30] },
      properties: { pinIcon: 'camera', pinStyle: 'pushpin', pinHeight: 180 },
      tags: ['watchtower', 'palantir'],
    }),
  ];

  for (const entity of entities) {
    world.entities[entity.id] = entity;
  }
  return world;
}

export function createTemplateWorld(): World {
  const world = createEmptyWorld('Template Sci-Fi World');
  world.properties = { theme: 'modern' };
  world.camera = {
    lon: 10,
    lat: 17,
    height: 1_200_000,
    heading: 0,
    pitch: -45,
  };

  const entities: TerraEntity[] = [
    // 1. Continent Region
    createEntity({
      type: 'region',
      name: 'Neo-Pangea Continent',
      description: 'A modern sci-fi continent spanning a large coastal shelf.',
      color: '#0e7490',
      fillOpacity: 0.8,
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [2, 10],
            [18, 10],
            [22, 18],
            [16, 28],
            [4, 26],
            [0, 18],
            [2, 10],
          ],
        ],
      },
      properties: { biome: 'satellite-blend' },
      tags: ['continent', 'modern'],
    }),

    // 2. High-Density Modern City Region (Polygon)
    createEntity({
      type: 'city',
      name: 'Metropolis Core',
      description: 'The primary urban downtown sector, mapped with high-density asphalt street grids.',
      color: '#475569',
      fillOpacity: 0.9,
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [6, 14],
            [14, 14],
            [12, 20],
            [8, 20],
            [6, 14],
          ],
        ],
      },
      properties: { biome: 'city-urban' },
      tags: ['city', 'urban-grid'],
    }),

    // 3. Central Downtown Skyscraper Landmark (Point)
    createEntity({
      type: 'city',
      name: 'Apex Plaza Tower',
      description: 'The mega-tall centerpiece of Metropolis Core with photo-facade window textures.',
      color: '#38bdf8',
      fillOpacity: 1,
      geometry: {
        type: 'Point',
        coordinates: [10, 17],
      },
      properties: { pinIcon: 'building', pinStyle: 'beacon', pinHeight: 550 },
      tags: ['city', 'landmark', 'skyscraper'],
    }),

    // 4. Secondary Airport/Industrial Town (Point)
    createEntity({
      type: 'town',
      name: 'Aerotropolis District',
      description: 'Suburban tech park and airport district showing aligned modern structures.',
      color: '#cbd5e1',
      fillOpacity: 1,
      geometry: {
        type: 'Point',
        coordinates: [14, 22],
      },
      properties: { pinIcon: 'airport', pinStyle: 'pushpin', pinHeight: 180 },
      tags: ['town', 'airport', 'tech-park'],
    }),

    // 5. Ridge Mountains (Extruded Contour)
    createEntity({
      type: 'region',
      name: 'Sentinel Peaks',
      description: 'A ridge mountain range with extruded contours and altitude snow peaks.',
      color: '#475569',
      fillOpacity: 0.85,
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [16, 24],
            [19, 25],
            [18, 27],
            [15, 26],
            [16, 24],
          ],
        ],
      },
      properties: { biome: 'mountain-slate', extrudedHeight: 350 },
      tags: ['mountain', 'sentinel'],
    }),
  ];

  for (const entity of entities) {
    world.entities[entity.id] = entity;
  }
  return world;
}
