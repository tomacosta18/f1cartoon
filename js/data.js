// ============================================================================
// DATA.JS — Oficial 22 Pilotos, 11 Escuderías, 10 Atributos (Parche v1.5:
//           + Adelantamiento y Defensa), 3 Circuitos + Persistencia localStorage
// (Script clásico compatible con file:// y HTTP/Netlify)
// ============================================================================
(function (global) {
  'use strict';

  const STORAGE_KEY = 'f1_brick_turbo_custom_v11';
  const F1_POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];

  const STAT_META = [
    { key: 'velocidad', label: 'Velocidad Punta', short: 'VEL', icon: '⚡', color: '#FF3B5C', desc: 'Velocidad máxima en rectas y rebufo' },
    { key: 'aceleracion', label: 'Aceleración', short: 'ACE', icon: '🚀', color: '#FF922B', desc: 'Salida progresiva desde parado y tracción en marchas bajas' },
    { key: 'maniobrabilidad', label: 'Paso por Curva', short: 'CRV', icon: '🎯', color: '#FFD43B', desc: 'Agilidad de dirección y velocidad en vértices' },
    { key: 'freno', label: 'Frenada', short: 'FRE', icon: '🛑', color: '#22C55E', desc: 'Frenada tardía y estabilidad al apurar curvas' },
    { key: 'tecnica', label: 'Técnica', short: 'TEC', icon: '🌧️', color: '#A855F7', desc: 'Control en lluvia, curvas cerradas y potencia Turbo' },
    { key: 'carisma', label: 'Carisma', short: 'CAR', icon: '⭐', color: '#F472B6', desc: 'Apoyo de la hinchada y carga de Moral' },
    { key: 'consistencia', label: 'Consistencia', short: 'CON', icon: '🏆', color: '#3B82F6', desc: 'Ritmo constante, limpieza y recuperación en carrera' },
    { key: 'neumaticos', label: 'Gestión de Neumáticos', short: 'NEU', icon: '🛞', color: '#00E5FF', desc: 'Agarre sostenido en curva y recarga eficiente del Turbo' },
    { key: 'adelantamiento', label: 'Adelantamiento', short: 'ADE', icon: '⚔️', color: '#F97316', desc: 'Velocidad de carga de la barra táctica ADELANTAR en rectas' },
    { key: 'defensa', label: 'Defensa', short: 'DEF', icon: '🛡️', color: '#10B981', desc: 'Estabilidad lateral al cubrir la línea y resistencia al ataque rival' }
  ];

  const NATIONALITIES = [
    { flag: '🇦🇷', name: 'Argentina' },
    { flag: '🇪🇸', name: 'España' },
    { flag: '🇲🇽', name: 'México' },
    { flag: '🇧🇷', name: 'Brasil' },
    { flag: '🇬🇧', name: 'Reino Unido' },
    { flag: '🇳🇱', name: 'Países Bajos' },
    { flag: '🇲🇨', name: 'Mónaco' },
    { flag: '🇮🇹', name: 'Italia' },
    { flag: '🇫🇷', name: 'Francia' },
    { flag: '🇩🇪', name: 'Alemania' },
    { flag: '🇦🇺', name: 'Australia' },
    { flag: '🇳🇿', name: 'Nueva Zelanda' },
    { flag: '🇨🇦', name: 'Canadá' },
    { flag: '🇫🇮', name: 'Finlandia' },
    { flag: '🇹🇭', name: 'Tailandia' },
    { flag: '🇺🇸', name: 'Estados Unidos' },
    { flag: '🇯🇵', name: 'Japón' },
    { flag: '🇨🇴', name: 'Colombia' },
    { flag: '🇨🇱', name: 'Chile' },
    { flag: '🇺🇾', name: 'Uruguay' },
    { flag: '🇦🇹', name: 'Austria' },
    { flag: '🇧🇪', name: 'Bélgica' },
    { flag: '🇨🇭', name: 'Suiza' },
    { flag: '🇸🇪', name: 'Suecia' },
    { flag: '🇩🇰', name: 'Dinamarca' }
  ];

  const HAIR_STYLES = [
    { id: 'curly', label: 'Rizado' },
    { id: 'swept', label: 'Peinado' },
    { id: 'spiky', label: 'Puntas' },
    { id: 'wavy', label: 'Ondulado' },
    { id: 'braids', label: 'Trenzas' },
    { id: 'mullet', label: 'Mullet' },
    { id: 'buzz', label: 'Rapado' },
    { id: 'bald', label: 'Calvo' }
  ];

  const BEARD_STYLES = [
    { id: 'none', label: 'Sin barba' },
    { id: 'stubble', label: 'Sombra' },
    { id: 'beard', label: 'Barba' },
    { id: 'mustache', label: 'Bigote' },
    { id: 'goatee', label: 'Candado' }
  ];

  const SKIN_SWATCHES = ['#FDE2CC', '#FAD2B4', '#F6C8A8', '#EBB790', '#DDA17A', '#C68642', '#8D5524', '#5C381A'];
  const HAIR_SWATCHES = ['#181414', '#2E1F16', '#4E3824', '#7C4F2B', '#B5894A', '#D9B36C', '#B91C1C', '#94A3B8', '#FFFFFF'];
  const RACING_SWATCHES = [
    '#E80020', '#FF8000', '#FFD100', '#22C55E', '#00D2BE', '#0090FF',
    '#1B2A59', '#7C3AED', '#FF4F9A', '#F5F7FA', '#94A3B8', '#181A20'
  ];

  const DEFAULT_TEAMS = [
    { id: 'mclaren', name: 'McLaren', short: 'MCL', rating: 94, primary: '#FF8000', secondary: '#181A20', accent: '#00D2FF', suit: '#FF8000', wheelRim: '#FF8000', country: '🇬🇧', motto: 'Papaya Speed' },
    { id: 'ferrari', name: 'Ferrari', short: 'FER', rating: 93, primary: '#E80020', secondary: '#FFF200', accent: '#FFFFFF', suit: '#DC0000', wheelRim: '#FFF200', country: '🇮🇹', motto: 'Forza Cavallino' },
    { id: 'mercedes', name: 'Mercedes', short: 'MER', rating: 91, primary: '#1E232A', secondary: '#00D2BE', accent: '#D9E2EC', suit: '#161A20', wheelRim: '#00D2BE', country: '🇩🇪', motto: 'Flechas de Plata' },
    { id: 'redbull', name: 'Red Bull', short: 'RBR', rating: 92, primary: '#1B2A59', secondary: '#FF1E42', accent: '#FFD100', suit: '#18244D', wheelRim: '#FFD100', country: '🇦🇹', motto: 'Alas en Pista' },
    { id: 'astonmartin', name: 'Aston Martin', short: 'AST', rating: 86, primary: '#006F62', secondary: '#CEDC00', accent: '#004A40', suit: '#006F62', wheelRim: '#CEDC00', country: '🇬🇧', motto: 'Verde Británico' },
    { id: 'williams', name: 'Williams', short: 'WIL', rating: 85, primary: '#005AFF', secondary: '#00A3FF', accent: '#FF8A00', suit: '#0048CC', wheelRim: '#00C8FF', country: '🇬🇧', motto: 'Herencia de Campeones' },
    { id: 'alpine', name: 'Alpine', short: 'ALP', rating: 82, primary: '#0090FF', secondary: '#FF4F9A', accent: '#182032', suit: '#0078DB', wheelRim: '#FF4F9A', country: '🇫🇷', motto: 'Bleu & Pink Turbo' },
    { id: 'racingbulls', name: 'Racing Bulls', short: 'VCB', rating: 83, primary: '#F5F7FA', secondary: '#2255EE', accent: '#FF2A44', suit: '#F0F4FA', wheelRim: '#2255EE', country: '🇮🇹', motto: 'Energía Pura' },
    { id: 'haas', name: 'Haas', short: 'HAA', rating: 81, primary: '#F4F6F8', secondary: '#E6002B', accent: '#1C1F26', suit: '#1E222B', wheelRim: '#E6002B', country: '🇺🇸', motto: 'Fuerza Americana' },
    { id: 'audi', name: 'Audi', short: 'AUD', rating: 82, primary: '#C8CED6', secondary: '#F50537', accent: '#14171C', suit: '#22262E', wheelRim: '#F50537', country: '🇩🇪', motto: 'Vorsprung Turbo' },
    { id: 'cadillac', name: 'Cadillac', short: 'CAD', rating: 80, primary: '#151821', secondary: '#F5C518', accent: '#FFFFFF', suit: '#191D28', wheelRim: '#F5C518', country: '🇺🇸', motto: 'Lujo y Potencia V8' }
  ];

  const DEFAULT_DRIVERS = [
    {
      id: 'norris', name: 'Lando Norris', short: 'NOR', number: 4, teamId: 'mclaren', flag: '🇬🇧', tagline: 'Rey del Ritmo Papaya',
      stats: { velocidad: 93, aceleracion: 92, maniobrabilidad: 93, freno: 90, tecnica: 91, carisma: 95, consistencia: 90, neumaticos: 91, adelantamiento: 92, defensa: 90 },
      look: { skin: '#F6C8A8', hairColor: '#5B4028', hairStyle: 'curly', beard: 'none', browStyle: 'playful', helmetMain: '#D8FF00', helmetStripe: '#111111', helmetAccent: '#00D2FF', visor: '#111827' }
    },
    {
      id: 'russell', name: 'George Russell', short: 'RUS', number: 63, teamId: 'mercedes', flag: '🇬🇧', tagline: 'Mr. Consistencia',
      stats: { velocidad: 91, aceleracion: 90, maniobrabilidad: 91, freno: 91, tecnica: 91, carisma: 86, consistencia: 93, neumaticos: 89, adelantamiento: 90, defensa: 92 },
      look: { skin: '#F7C9AD', hairColor: '#5C4430', hairStyle: 'swept', beard: 'none', browStyle: 'sharp', helmetMain: '#1E90FF', helmetStripe: '#00F5D4', helmetAccent: '#FFFFFF', visor: '#0F172A' }
    },
    {
      id: 'antonelli', name: 'Kimi Antonelli', short: 'ANT', number: 12, teamId: 'mercedes', flag: '🇮🇹', tagline: 'Prodigio Italiano',
      stats: { velocidad: 87, aceleracion: 88, maniobrabilidad: 87, freno: 83, tecnica: 84, carisma: 88, consistencia: 83, neumaticos: 84, adelantamiento: 88, defensa: 81 },
      look: { skin: '#F3C1A0', hairColor: '#3B281B', hairStyle: 'curly', beard: 'none', browStyle: 'happy', helmetMain: '#0047AB', helmetStripe: '#00FFCC', helmetAccent: '#FF2A44', visor: '#00B4D8' }
    },
    {
      id: 'leclerc', name: 'Charles Leclerc', short: 'LEC', number: 16, teamId: 'ferrari', flag: '🇲🇨', tagline: 'Príncipe de Mónaco',
      stats: { velocidad: 94, aceleracion: 93, maniobrabilidad: 94, freno: 92, tecnica: 93, carisma: 95, consistencia: 91, neumaticos: 90, adelantamiento: 95, defensa: 91 },
      look: { skin: '#F2BF9B', hairColor: '#4A3422', hairStyle: 'swept', beard: 'stubble', browStyle: 'sharp', helmetMain: '#E80020', helmetStripe: '#FFFFFF', helmetAccent: '#FFD700', visor: '#1E1B4B' }
    },
    {
      id: 'lawson', name: 'Liam Lawson', short: 'LAW', number: 30, teamId: 'racingbulls', flag: '🇳🇿', tagline: 'Duelo sin Miedo',
      stats: { velocidad: 84, aceleracion: 85, maniobrabilidad: 84, freno: 83, tecnica: 82, carisma: 83, consistencia: 84, neumaticos: 83, adelantamiento: 87, defensa: 84 },
      look: { skin: '#F7C9A8', hairColor: '#B5894A', hairStyle: 'spiky', beard: 'none', browStyle: 'fierce', helmetMain: '#FFFFFF', helmetStripe: '#FF3399', helmetAccent: '#111827', visor: '#EC4899' }
    },
    {
      id: 'hulkenberg', name: 'Nico Hülkenberg', short: 'HUL', number: 27, teamId: 'audi', flag: '🇩🇪', tagline: 'Veterano Preciso',
      stats: { velocidad: 86, aceleracion: 84, maniobrabilidad: 86, freno: 87, tecnica: 88, carisma: 86, consistencia: 88, neumaticos: 87, adelantamiento: 85, defensa: 89 },
      look: { skin: '#F8CCA8', hairColor: '#D4A857', hairStyle: 'swept', beard: 'stubble', browStyle: 'sharp', helmetMain: '#1E242B', helmetStripe: '#FF2442', helmetAccent: '#E2E8F0', visor: '#111827' }
    },
    {
      id: 'hadjar', name: 'Isack Hadjar', short: 'HAD', number: 6, teamId: 'redbull', flag: '🇫🇷', tagline: 'Chispa Eléctrica',
      stats: { velocidad: 86, aceleracion: 87, maniobrabilidad: 85, freno: 82, tecnica: 83, carisma: 84, consistencia: 83, neumaticos: 84, adelantamiento: 87, defensa: 81 },
      look: { skin: '#DDA17A', hairColor: '#1E1A18', hairStyle: 'curly', beard: 'stubble', browStyle: 'fierce', helmetMain: '#1A2B6D', helmetStripe: '#FFD100', helmetAccent: '#FF1E42', visor: '#FACC15' }
    },
    {
      id: 'bearman', name: 'Oliver Bearman', short: 'BEA', number: 87, teamId: 'haas', flag: '🇬🇧', tagline: 'Oso Veloz',
      stats: { velocidad: 84, aceleracion: 85, maniobrabilidad: 84, freno: 82, tecnica: 82, carisma: 85, consistencia: 83, neumaticos: 83, adelantamiento: 86, defensa: 82 },
      look: { skin: '#F8CBB0', hairColor: '#6D4C32', hairStyle: 'curly', beard: 'none', browStyle: 'happy', helmetMain: '#FFFFFF', helmetStripe: '#0055CC', helmetAccent: '#E6002B', visor: '#1D4ED8' }
    },
    {
      id: 'alonso', name: 'Fernando Alonso', short: 'ALO', number: 14, teamId: 'astonmartin', flag: '🇪🇸', tagline: 'El Nano · Maestro Táctico',
      stats: { velocidad: 90, aceleracion: 92, maniobrabilidad: 93, freno: 94, tecnica: 96, carisma: 97, consistencia: 95, neumaticos: 94, adelantamiento: 94, defensa: 97 },
      look: { skin: '#E6B28A', hairColor: '#3A281D', hairStyle: 'wavy', beard: 'beard', browStyle: 'fierce', helmetMain: '#00A8E8', helmetStripe: '#FFD100', helmetAccent: '#FF2A44', visor: '#0284C7' }
    },
    {
      id: 'albon', name: 'Alex Albon', short: 'ALB', number: 23, teamId: 'williams', flag: '🇹🇭', tagline: 'Defensa de Acero',
      stats: { velocidad: 87, aceleracion: 86, maniobrabilidad: 88, freno: 87, tecnica: 88, carisma: 90, consistencia: 88, neumaticos: 89, adelantamiento: 87, defensa: 93 },
      look: { skin: '#E8B892', hairColor: '#231D1A', hairStyle: 'spiky', beard: 'none', browStyle: 'happy', helmetMain: '#0044CC', helmetStripe: '#FFFFFF', helmetAccent: '#FF3355', visor: '#2563EB' }
    },
    {
      id: 'hamilton', name: 'Lewis Hamilton', short: 'HAM', number: 44, teamId: 'ferrari', flag: '🇬🇧', tagline: 'Leyenda 7× Campeón',
      stats: { velocidad: 92, aceleracion: 91, maniobrabilidad: 93, freno: 95, tecnica: 96, carisma: 98, consistencia: 94, neumaticos: 96, adelantamiento: 95, defensa: 94 },
      look: { skin: '#8D5524', hairColor: '#181414', hairStyle: 'braids', beard: 'beard', browStyle: 'sharp', helmetMain: '#FFE600', helmetStripe: '#E80020', helmetAccent: '#7C3AED', visor: '#9333EA' }
    },
    {
      id: 'piastri', name: 'Oscar Piastri', short: 'PIA', number: 81, teamId: 'mclaren', flag: '🇦🇺', tagline: 'Hielo Australiano',
      stats: { velocidad: 92, aceleracion: 91, maniobrabilidad: 91, freno: 91, tecnica: 90, carisma: 89, consistencia: 92, neumaticos: 90, adelantamiento: 93, defensa: 91 },
      look: { skin: '#F5C6A5', hairColor: '#4E3824', hairStyle: 'swept', beard: 'none', browStyle: 'sharp', helmetMain: '#FF8000', helmetStripe: '#00CC66', helmetAccent: '#FFD43B', visor: '#0EA5E9' }
    },
    {
      id: 'camara', name: 'R. Câmara', short: 'CAM', number: 38, teamId: 'haas', flag: '🇧🇷', tagline: 'Talento Brasileño',
      stats: { velocidad: 82, aceleracion: 84, maniobrabilidad: 83, freno: 80, tecnica: 82, carisma: 86, consistencia: 81, neumaticos: 82, adelantamiento: 84, defensa: 79 },
      look: { skin: '#E2AC84', hairColor: '#2B1F16', hairStyle: 'wavy', beard: 'none', browStyle: 'happy', helmetMain: '#00B84D', helmetStripe: '#FFD500', helmetAccent: '#0047AB', visor: '#16A34A' }
    },
    {
      id: 'lindblad', name: 'A. Lindblad', short: 'LIN', number: 41, teamId: 'racingbulls', flag: '🇬🇧', tagline: 'Velocidad Pura Joven',
      stats: { velocidad: 83, aceleracion: 85, maniobrabilidad: 83, freno: 80, tecnica: 81, carisma: 82, consistencia: 81, neumaticos: 82, adelantamiento: 85, defensa: 79 },
      look: { skin: '#D69E76', hairColor: '#221B17', hairStyle: 'spiky', beard: 'none', browStyle: 'fierce', helmetMain: '#1E3A8A', helmetStripe: '#FF2A44', helmetAccent: '#FFFFFF', visor: '#38BDF8' }
    },
    {
      id: 'sainz', name: 'Carlos Sainz', short: 'SAI', number: 55, teamId: 'williams', flag: '🇪🇸', tagline: 'Smooth Operator',
      stats: { velocidad: 90, aceleracion: 89, maniobrabilidad: 91, freno: 91, tecnica: 91, carisma: 93, consistencia: 92, neumaticos: 91, adelantamiento: 91, defensa: 92 },
      look: { skin: '#E8B28C', hairColor: '#2E1F16', hairStyle: 'wavy', beard: 'beard', browStyle: 'sharp', helmetMain: '#FF2442', helmetStripe: '#FFD500', helmetAccent: '#005AFF', visor: '#DC2626' }
    },
    {
      id: 'verstappen', name: 'Max Verstappen', short: 'VER', number: 1, teamId: 'redbull', flag: '🇳🇱', tagline: 'Super Max · Imparable',
      stats: { velocidad: 97, aceleracion: 96, maniobrabilidad: 95, freno: 96, tecnica: 96, carisma: 94, consistencia: 97, neumaticos: 95, adelantamiento: 97, defensa: 95 },
      look: { skin: '#F8CCA8', hairColor: '#A67C46', hairStyle: 'spiky', beard: 'stubble', browStyle: 'fierce', helmetMain: '#FFFFFF', helmetStripe: '#FF6A00', helmetAccent: '#FFD700', visor: '#F97316' }
    },
    {
      id: 'colapinto', name: 'F. Colapinto', short: 'COL', number: 43, teamId: 'alpine', flag: '🇦🇷', tagline: 'Furia Albiceleste',
      stats: { velocidad: 86, aceleracion: 86, maniobrabilidad: 85, freno: 83, tecnica: 84, carisma: 96, consistencia: 85, neumaticos: 86, adelantamiento: 88, defensa: 83 },
      look: { skin: '#F1BE98', hairColor: '#4B3423', hairStyle: 'wavy', beard: 'none', browStyle: 'playful', helmetMain: '#5CC8FF', helmetStripe: '#FFFFFF', helmetAccent: '#FFD43B', visor: '#0284C7' }
    },
    {
      id: 'gasly', name: 'P. Gasly', short: 'GAS', number: 10, teamId: 'alpine', flag: '🇫🇷', tagline: 'Ataque Tricolor',
      stats: { velocidad: 87, aceleracion: 87, maniobrabilidad: 86, freno: 86, tecnica: 86, carisma: 88, consistencia: 86, neumaticos: 85, adelantamiento: 87, defensa: 86 },
      look: { skin: '#F3C3A1', hairColor: '#4D3624', hairStyle: 'spiky', beard: 'beard', browStyle: 'sharp', helmetMain: '#0066FF', helmetStripe: '#FF4F9A', helmetAccent: '#FFFFFF', visor: '#2563EB' }
    },
    {
      id: 'stroll', name: 'Lance Stroll', short: 'STR', number: 18, teamId: 'astonmartin', flag: '🇨🇦', tagline: 'Especialista en Salidas',
      stats: { velocidad: 83, aceleracion: 87, maniobrabilidad: 81, freno: 81, tecnica: 83, carisma: 77, consistencia: 80, neumaticos: 82, adelantamiento: 83, defensa: 78 },
      look: { skin: '#F3C19E', hairColor: '#2B2018', hairStyle: 'spiky', beard: 'stubble', browStyle: 'sharp', helmetMain: '#006F62', helmetStripe: '#FFFFFF', helmetAccent: '#CEDC00', visor: '#10B981' }
    },
    {
      id: 'bottas', name: 'Valtteri Bottas', short: 'BOT', number: 77, teamId: 'cadillac', flag: '🇫🇮', tagline: 'El Bigote Más Rápido',
      stats: { velocidad: 87, aceleracion: 86, maniobrabilidad: 85, freno: 86, tecnica: 87, carisma: 92, consistencia: 87, neumaticos: 88, adelantamiento: 84, defensa: 88 },
      look: { skin: '#FAD2B4', hairColor: '#D9B36C', hairStyle: 'mullet', beard: 'mustache', browStyle: 'happy', helmetMain: '#0099FF', helmetStripe: '#FFFFFF', helmetAccent: '#F5C518', visor: '#0EA5E9' }
    },
    {
      id: 'perez', name: 'Sergio Pérez', short: 'PER', number: 11, teamId: 'cadillac', flag: '🇲🇽', tagline: 'Ministro de Defensa',
      stats: { velocidad: 86, aceleracion: 86, maniobrabilidad: 86, freno: 88, tecnica: 88, carisma: 95, consistencia: 85, neumaticos: 94, adelantamiento: 87, defensa: 96 },
      look: { skin: '#DEA77E', hairColor: '#241B16', hairStyle: 'swept', beard: 'beard', browStyle: 'happy', helmetMain: '#00A859', helmetStripe: '#FFFFFF', helmetAccent: '#FF2442', visor: '#F59E0B' }
    },
    {
      id: 'bortoleto', name: 'G. Bortoleto', short: 'BOR', number: 5, teamId: 'audi', flag: '🇧🇷', tagline: 'Campeón en Ascenso',
      stats: { velocidad: 84, aceleracion: 85, maniobrabilidad: 85, freno: 83, tecnica: 84, carisma: 87, consistencia: 85, neumaticos: 84, adelantamiento: 86, defensa: 83 },
      look: { skin: '#EBB790', hairColor: '#3E2B1E', hairStyle: 'wavy', beard: 'none', browStyle: 'playful', helmetMain: '#FFDF00', helmetStripe: '#009C3B', helmetAccent: '#002776', visor: '#15803D' }
    }
  ];

  const CIRCUITS = [
    {
      id: 'monaco', name: 'Mónaco', fullName: 'Gran Premio de Mónaco', location: 'Montecarlo, Mónaco', flag: '🇲🇨',
      themeColor: '#00B4D8', accentColor: '#FF4D6D', weather: 'soleado', weatherLabel: '☀️ Sol Mediterráneo',
      keyStat: 'tecnica', keyStatLabel: '🌧️ Técnica & 🎯 Paso por Curva',
      description: 'Calles estrechas de Montecarlo, horquillas legendarias, edificios pastel y yates flotando en el puerto.',
      rainIntensity: 0, trackWidth: 16.5, difficulty: 'Técnico', defaultLaps: 3
    },
    {
      id: 'silverstone', name: 'Silverstone', fullName: 'Gran Premio de Gran Bretaña', location: 'Northamptonshire, Reino Unido', flag: '🇬🇧',
      themeColor: '#38BDF8', accentColor: '#EF4444', weather: 'lluvia', weatherLabel: '🌧️ Lluvia Británica',
      keyStat: 'tecnica', keyStatLabel: '🌧️ Técnica en Lluvia & ⚡ Velocidad Punta',
      description: 'Curvas rápidas enlazadas bajo lluvia dinámica que pone a prueba tu Técnica, hangares y la noria gigante girando.',
      rainIntensity: 0.72, trackWidth: 21.5, difficulty: 'Lluvia Rápida', defaultLaps: 3
    },
    {
      id: 'abudhabi', name: 'Abu Dabi', fullName: 'Gran Premio de Abu Dabi', location: 'Yas Marina, EAU', flag: '🇦🇪',
      themeColor: '#A855F7', accentColor: '#FB923C', weather: 'atardecer', weatherLabel: '🌅 Atardecer Neón',
      keyStat: 'neumaticos', keyStatLabel: '🛞 Gestión & ⚡ Velocidad Punta',
      description: 'Rectas eternas ideales para exprimir el Turbo, palmeras al atardecer y el hotel puente con luces neón dinámicas.',
      rainIntensity: 0, trackWidth: 22.0, difficulty: 'Alta Velocidad', defaultLaps: 3
    }
  ];

  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  // Mutable live rosters initialized from immutable defaults
  const TEAMS = deepClone(DEFAULT_TEAMS);
  const DRIVERS = deepClone(DEFAULT_DRIVERS);

  function clampStat(val, fallback = 85) {
    const n = Number(val);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(1, Math.min(99, Math.round(n)));
  }

  function sanitizeHex(hex, fallback) {
    if (typeof hex !== 'string') return fallback;
    const cleaned = hex.trim().toUpperCase();
    return /^#[0-9A-F]{6}$/.test(cleaned) ? cleaned : fallback;
  }

  function getTeamById(teamId) {
    return TEAMS.find(t => t.id === teamId) || TEAMS[0];
  }
  function getDriverById(driverId) {
    return DRIVERS.find(d => d.id === driverId) || DRIVERS[0];
  }
  function getDefaultTeamById(teamId) {
    return DEFAULT_TEAMS.find(t => t.id === teamId) || DEFAULT_TEAMS[0];
  }
  function getDefaultDriverById(driverId) {
    return DEFAULT_DRIVERS.find(d => d.id === driverId) || DEFAULT_DRIVERS[0];
  }
  function getCircuitById(circuitId) {
    return CIRCUITS.find(c => c.id === circuitId) || CIRCUITS[0];
  }

  function getDriverOverall(driver) {
    if (!driver || !driver.stats) return 80;
    const sum = STAT_META.reduce((acc, m) => acc + clampStat(driver.stats[m.key], 80), 0);
    return Math.round(sum / STAT_META.length);
  }

  function loadCustomizations() {
    try {
      const raw = global.localStorage && global.localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return false;

      if (parsed.teams && typeof parsed.teams === 'object') {
        TEAMS.forEach(team => {
          const patch = parsed.teams[team.id];
          if (!patch) return;
          if (typeof patch.name === 'string' && patch.name.trim()) team.name = patch.name.trim().slice(0, 24);
          if (typeof patch.short === 'string' && patch.short.trim()) team.short = patch.short.trim().toUpperCase().slice(0, 3);
          if (patch.primary) team.primary = sanitizeHex(patch.primary, team.primary);
          if (patch.secondary) team.secondary = sanitizeHex(patch.secondary, team.secondary);
          if (patch.accent) team.accent = sanitizeHex(patch.accent, team.accent);
          if (patch.suit) team.suit = sanitizeHex(patch.suit, team.primary);
          if (patch.wheelRim) team.wheelRim = sanitizeHex(patch.wheelRim, team.wheelRim);
          if (patch.rating !== undefined) team.rating = clampStat(patch.rating, team.rating);
        });
      }

      if (parsed.drivers && typeof parsed.drivers === 'object') {
        DRIVERS.forEach(driver => {
          const patch = parsed.drivers[driver.id];
          if (!patch) return;
          if (typeof patch.name === 'string' && patch.name.trim()) driver.name = patch.name.trim().slice(0, 26);
          if (typeof patch.short === 'string' && patch.short.trim()) driver.short = patch.short.trim().toUpperCase().slice(0, 3);
          if (patch.number !== undefined) driver.number = clampStat(patch.number, driver.number);
          if (typeof patch.flag === 'string' && patch.flag.trim()) driver.flag = patch.flag.trim();
          if (typeof patch.tagline === 'string' && patch.tagline.trim()) driver.tagline = patch.tagline.trim().slice(0, 40);

          if (patch.look && typeof patch.look === 'object') {
            const lk = patch.look;
            if (lk.skin) driver.look.skin = sanitizeHex(lk.skin, driver.look.skin);
            if (lk.hairColor) driver.look.hairColor = sanitizeHex(lk.hairColor, driver.look.hairColor);
            if (typeof lk.hairStyle === 'string') driver.look.hairStyle = lk.hairStyle;
            if (typeof lk.beard === 'string') driver.look.beard = lk.beard;
            if (typeof lk.browStyle === 'string') driver.look.browStyle = lk.browStyle;
            if (lk.helmetMain) driver.look.helmetMain = sanitizeHex(lk.helmetMain, driver.look.helmetMain);
            if (lk.helmetStripe) driver.look.helmetStripe = sanitizeHex(lk.helmetStripe, driver.look.helmetStripe);
            if (lk.helmetAccent) driver.look.helmetAccent = sanitizeHex(lk.helmetAccent, driver.look.helmetAccent);
            if (lk.visor) driver.look.visor = sanitizeHex(lk.visor, driver.look.visor);
          }

          if (patch.stats && typeof patch.stats === 'object') {
            STAT_META.forEach(m => {
              if (patch.stats[m.key] !== undefined) {
                driver.stats[m.key] = clampStat(patch.stats[m.key], driver.stats[m.key]);
              }
            });
          }
        });
      }
      return true;
    } catch (err) {
      console.warn('No se pudieron cargar personalizaciones previas:', err);
      return false;
    }
  }

  function saveCustomizations() {
    try {
      const payload = { version: '1.1', teams: {}, drivers: {} };
      TEAMS.forEach((team, idx) => {
        const def = DEFAULT_TEAMS[idx];
        if (JSON.stringify(team) !== JSON.stringify(def)) {
          payload.teams[team.id] = {
            name: team.name,
            short: team.short,
            primary: team.primary,
            secondary: team.secondary,
            accent: team.accent,
            suit: team.suit,
            wheelRim: team.wheelRim,
            rating: team.rating
          };
        }
      });
      DRIVERS.forEach((driver, idx) => {
        const def = DEFAULT_DRIVERS[idx];
        if (JSON.stringify(driver) !== JSON.stringify(def)) {
          payload.drivers[driver.id] = {
            name: driver.name,
            short: driver.short,
            number: driver.number,
            flag: driver.flag,
            tagline: driver.tagline,
            look: deepClone(driver.look),
            stats: deepClone(driver.stats)
          };
        }
      });
      global.localStorage && global.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      return true;
    } catch (err) {
      console.warn('Error guardando personalizaciones en localStorage:', err);
      return false;
    }
  }

  function restoreDriverAndTeamDefaults(driverId) {
    const driver = getDriverById(driverId);
    const defDriver = getDefaultDriverById(driverId);
    const team = getTeamById(driver.teamId);
    const defTeam = getDefaultTeamById(driver.teamId);

    Object.assign(driver, deepClone(defDriver));
    Object.assign(team, deepClone(defTeam));
    saveCustomizations();
    return { driver, team };
  }

  function restoreAllDefaults() {
    DEFAULT_TEAMS.forEach((defTeam, idx) => {
      Object.assign(TEAMS[idx], deepClone(defTeam));
    });
    DEFAULT_DRIVERS.forEach((defDriver, idx) => {
      Object.assign(DRIVERS[idx], deepClone(defDriver));
    });
    try {
      global.localStorage && global.localStorage.removeItem(STORAGE_KEY);
    } catch (_) {}
  }

  // Auto-load persisted customizations immediately on startup
  loadCustomizations();

  global.F1Data = {
    STORAGE_KEY,
    F1_POINTS,
    STAT_META,
    NATIONALITIES,
    HAIR_STYLES,
    BEARD_STYLES,
    SKIN_SWATCHES,
    HAIR_SWATCHES,
    RACING_SWATCHES,
    TEAMS,
    DRIVERS,
    CIRCUITS,
    DEFAULT_TEAMS,
    DEFAULT_DRIVERS,
    getTeamById,
    getDriverById,
    getDefaultTeamById,
    getDefaultDriverById,
    getCircuitById,
    getDriverOverall,
    clampStat,
    sanitizeHex,
    deepClone,
    loadCustomizations,
    saveCustomizations,
    restoreDriverAndTeamDefaults,
    restoreAllDefaults
  };
})(window);
