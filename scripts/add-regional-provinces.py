#!/usr/bin/env python3
# scripts/add-regional-provinces.py
# Fase 2 — Adiciona províncias regionais (2ª e 3ª cidade) a países que só têm
# a capital. Dados reais aproximados: nome, lat/lng, fração da população/PIB,
# cultura/etnia local (quando diferente), lealdade e valor estratégico.
#
# Mantém as províncias existentes. Cada país fica com ≥2 províncias (as capitais
# já existentes + as novas). Os 10 países que já têm 3 províncias não são tocados.
#
# Output: reescreve src/data/scenarios/mundo-2025.json com as novas províncias.
import json, os, sys

SCENARIO_PATH = "src/data/scenarios/mundo-2025.json"
COUNTRIES_PATH = "src/data/countries.json"

# Dicionário: countryId -> lista de {id_suffix, nome, lat, lng, frac_pop, frac_pib,
# cultura (opcional), lealdade_offset, recursos, valor_estrategico}
# frac_pop e frac_pib são frações da população/PIB do país (0-1).
# Para países pequenos basta 1 extra; para grandes, 2.
REGIONAL = {
    # --- Europa ---
    "PRT": [
        {"id": "OPO", "nome": "Porto", "lat": 41.15, "lng": -8.61, "frac_pop": 0.10, "frac_pib": 0.13, "cultura": "portuguesa", "lealdade_offset": 5, "recursos": ["indústria", "vinho do Porto"], "valor_estrategico": 3},
        {"id": "COI", "nome": "Coimbra", "lat": 40.21, "lng": -8.43, "frac_pop": 0.02, "frac_pib": 0.02, "cultura": "portuguesa", "lealdade_offset": 8, "recursos": ["ensino", "saúde"], "valor_estrategico": 2},
    ],
    "ESP": [
        {"id": "BCN", "nome": "Barcelona", "lat": 41.39, "lng": 2.17, "frac_pop": 0.10, "frac_pib": 0.14, "cultura": "catalã", "lealdade_offset": -5, "recursos": ["turismo", "indústria", "portos"], "valor_estrategico": 4},
        {"id": "SEV", "nome": "Sevilha", "lat": 37.39, "lng": -5.99, "frac_pop": 0.05, "frac_pib": 0.04, "cultura": "andaluz", "lealdade_offset": 3, "recursos": ["agricultura", "turismo"], "valor_estrategico": 2},
    ],
    "FRA": [
        {"id": "LYO", "nome": "Lião", "lat": 45.76, "lng": 4.84, "frac_pop": 0.07, "frac_pib": 0.08, "cultura": "francesa", "lealdade_offset": 4, "recursos": ["farmacêutica", "biotecnologia"], "valor_estrategico": 3},
        {"id": "MRS", "nome": "Marselha", "lat": 43.30, "lng": 5.37, "frac_pop": 0.05, "frac_pib": 0.05, "cultura": "francesa", "lealdade_offset": -2, "recursos": ["portos", "petroquímica"], "valor_estrategico": 4},
    ],
    "DEU": [
        {"id": "MUC", "nome": "Munique", "lat": 48.14, "lng": 11.58, "frac_pop": 0.09, "frac_pib": 0.13, "cultura": "alemã", "lealdade_offset": 6, "recursos": ["automóvel", "tecnologia"], "valor_estrategico": 4},
        {"id": "HAM", "nome": "Hamburgo", "lat": 53.55, "lng": 9.99, "frac_pop": 0.06, "frac_pib": 0.08, "cultura": "alemã", "lealdade_offset": 5, "recursos": ["portos", "logística"], "valor_estrategico": 4},
    ],
    "GBR": [
        {"id": "MAN", "nome": "Manchester", "lat": 53.48, "lng": -2.24, "frac_pop": 0.08, "frac_pib": 0.07, "cultura": "inglesa", "lealdade_offset": 2, "recursos": ["indústria", "media"], "valor_estrategico": 3},
        {"id": "EDB", "nome": "Edimburgo", "lat": 55.95, "lng": -3.19, "frac_pop": 0.04, "frac_pib": 0.04, "cultura": "escocesa", "lealdade_offset": -3, "recursos": ["finanças", "turismo"], "valor_estrategico": 3},
    ],
    "ITA": [
        {"id": "MIL", "nome": "Milão", "lat": 45.46, "lng": 9.19, "frac_pop": 0.10, "frac_pib": 0.14, "cultura": "italiana", "lealdade_offset": 3, "recursos": ["finanças", "moda", "indústria"], "valor_estrategico": 4},
        {"id": "NAP", "nome": "Nápoles", "lat": 40.85, "lng": 14.27, "frac_pop": 0.06, "frac_pib": 0.04, "cultura": "italiana", "lealdade_offset": -4, "recursos": ["portos", "turismo"], "valor_estrategico": 3},
    ],
    "POL": [
        {"id": "KRK", "nome": "Cracóvia", "lat": 50.06, "lng": 19.94, "frac_pop": 0.08, "frac_pib": 0.07, "cultura": "polaca", "lealdade_offset": 6, "recursos": ["turismo", "carvão", "indústria"], "valor_estrategico": 3},
        {"id": "WRO", "nome": "Wrocław", "lat": 51.11, "lng": 17.04, "frac_pop": 0.05, "frac_pib": 0.06, "cultura": "polaca", "lealdade_offset": 5, "recursos": ["tecnologia", "indústria"], "valor_estrategico": 2},
    ],
    "SWE": [
        {"id": "GOT", "nome": "Gotemburgo", "lat": 57.71, "lng": 11.97, "frac_pop": 0.07, "frac_pib": 0.09, "cultura": "sueca", "lealdade_offset": 4, "recursos": ["portos", "automóvel"], "valor_estrategico": 3},
        {"id": "MAL", "nome": "Malmö", "lat": 55.60, "lng": 13.00, "frac_pop": 0.05, "frac_pib": 0.06, "cultura": "sueca", "lealdade_offset": -2, "recursos": ["tecnologia", "construção"], "valor_estrategico": 2},
    ],
    "BEL": [
        {"id": "ANT", "nome": "Antuérpia", "lat": 51.22, "lng": 4.40, "frac_pop": 0.10, "frac_pib": 0.13, "cultura": "flamenga", "lealdade_offset": 3, "recursos": ["portos", "diamantes", "petroquímica"], "valor_estrategico": 4},
    ],
    "CHE": [
        {"id": "ZUR", "nome": "Zurique", "lat": 47.37, "lng": 8.54, "frac_pop": 0.13, "frac_pib": 0.18, "cultura": "suíça-alemã", "lealdade_offset": 5, "recursos": ["finanças", "farmacêutica"], "valor_estrategico": 4},
    ],
    "UKR": [
        {"id": "KHR", "nome": "Carcóvia", "lat": 49.99, "lng": 36.23, "frac_pop": 0.10, "frac_pib": 0.08, "cultura": "ucraniana", "lealdade_offset": -8, "recursos": ["indústria", "agrícola"], "valor_estrategico": 4},
        {"id": "ODS", "nome": "Odesa", "lat": 46.48, "lng": 30.73, "frac_pop": 0.07, "frac_pib": 0.05, "cultura": "ucraniana", "lealdade_offset": -5, "recursos": ["portos", "turismo"], "valor_estrategico": 4},
    ],
    "TUR": [
        {"id": "IST", "nome": "Istambul", "lat": 41.01, "lng": 28.98, "frac_pop": 0.13, "frac_pib": 0.20, "cultura": "turca", "lealdade_offset": 0, "recursos": ["turismo", "comércio", "portos"], "valor_estrategico": 5},
        {"id": "IZM", "nome": "Esmirna", "lat": 38.42, "lng": 27.14, "frac_pop": 0.07, "frac_pib": 0.07, "cultura": "turca", "lealdade_offset": 2, "recursos": ["portos", "agricultura"], "valor_estrategico": 3},
    ],
    # --- Ásia ---
    "KOR": [
        {"id": "PUS", "nome": "Busan", "lat": 35.18, "lng": 129.08, "frac_pop": 0.07, "frac_pib": 0.08, "cultura": "coreana", "lealdade_offset": 2, "recursos": ["portos", "shipbuilding"], "valor_estrategico": 4},
        {"id": "ICN", "nome": "Incheon", "lat": 37.46, "lng": 126.71, "frac_pop": 0.06, "frac_pib": 0.06, "cultura": "coreana", "lealdade_offset": 4, "recursos": ["portos", "logística"], "valor_estrategico": 3},
    ],
    "VNM": [
        {"id": "HCM", "nome": "Cidade de Ho Chi Minh", "lat": 10.82, "lng": 106.63, "frac_pop": 0.10, "frac_pib": 0.20, "cultura": "vietnamita", "lealdade_offset": 3, "recursos": ["indústria", "portos"], "valor_estrategico": 4},
        {"id": "HPH", "nome": "Haiphong", "lat": 20.86, "lng": 106.68, "frac_pop": 0.04, "frac_pib": 0.04, "cultura": "vietnamita", "lealdade_offset": 5, "recursos": ["portos", "indústria"], "valor_estrategico": 3},
    ],
    "THA": [
        {"id": "CNX", "nome": "Chiang Mai", "lat": 18.79, "lng": 98.99, "frac_pop": 0.05, "frac_pib": 0.04, "cultura": "tai", "lealdade_offset": 4, "recursos": ["turismo", "agrícola"], "valor_estrategico": 2},
        {"id": "PHK", "nome": "Phuket", "lat": 7.88, "lng": 98.39, "frac_pop": 0.02, "frac_pib": 0.03, "cultura": "tai", "lealdade_offset": 6, "recursos": ["turismo"], "valor_estrategico": 2},
    ],
    "PHL": [
        {"id": "CEB", "nome": "Cebu", "lat": 10.32, "lng": 123.90, "frac_pop": 0.07, "frac_pib": 0.07, "cultura": "cebuano", "lealdade_offset": 3, "recursos": ["portos", "turismo"], "valor_estrategico": 3},
        {"id": "DAV", "nome": "Davao", "lat": 7.19, "lng": 125.46, "frac_pop": 0.06, "frac_pib": 0.05, "cultura": "tagala", "lealdade_offset": 0, "recursos": ["agrícola", "montagem"], "valor_estrategico": 2},
    ],
    "BGD": [
        {"id": "CHT", "nome": "Chittagong", "lat": 22.36, "lng": 91.80, "frac_pop": 0.07, "frac_pib": 0.08, "cultura": "bengali", "lealdade_offset": 0, "recursos": ["portos", "têxtil"], "valor_estrategico": 4},
    ],
    "PAK": [
        {"id": "KHI", "nome": "Carachi", "lat": 24.86, "lng": 67.01, "frac_pop": 0.13, "frac_pib": 0.15, "cultura": "sindi", "lealdade_offset": -3, "recursos": ["portos", "finanças"], "valor_estrategico": 4},
        {"id": "LHE", "nome": "Laore", "lat": 31.55, "lng": 74.34, "frac_pop": 0.10, "frac_pib": 0.12, "cultura": "punjabi", "lealdade_offset": 4, "recursos": ["indústria", "agrícola"], "valor_estrategico": 3},
    ],
    "IRN": [
        {"id": "MHD", "nome": "Mashhad", "lat": 36.30, "lng": 59.61, "frac_pop": 0.10, "frac_pib": 0.07, "cultura": "persa", "lealdade_offset": 0, "recursos": ["turismo religioso", "agrícola"], "valor_estrategico": 2},
        {"id": "IFN", "nome": "Isfahan", "lat": 32.65, "lng": 51.67, "frac_pop": 0.06, "frac_pib": 0.06, "cultura": "persa", "lealdade_offset": 2, "recursos": ["indústria", "petroquímica"], "valor_estrategico": 3},
    ],
    "SAU": [
        {"id": "JED", "nome": "Jidá", "lat": 21.49, "lng": 39.19, "frac_pop": 0.13, "frac_pib": 0.10, "cultura": "árabe-saudita", "lealdade_offset": 0, "recursos": ["portos", "turismo religioso"], "valor_estrategico": 4},
        {"id": "DMM", "nome": "Dammam", "lat": 26.42, "lng": 50.10, "frac_pop": 0.08, "frac_pib": 0.15, "cultura": "árabe-saudita", "lealdade_offset": 3, "recursos": ["petróleo", "petroquímica"], "valor_estrategico": 5},
    ],
    # --- América Latina ---
    "ARG": [
        {"id": "COR", "nome": "Córdoba", "lat": -31.42, "lng": -64.19, "frac_pop": 0.10, "frac_pib": 0.08, "cultura": "argentina", "lealdade_offset": 3, "recursos": ["indústria", "agrícola"], "valor_estrategico": 3},
        {"id": "ROS", "nome": "Rosário", "lat": -32.94, "lng": -60.64, "frac_pop": 0.06, "frac_pib": 0.05, "cultura": "argentina", "lealdade_offset": -2, "recursos": ["portos", "agrícola"], "valor_estrategico": 3},
    ],
    "COL": [
        {"id": "MED", "nome": "Medellín", "lat": 6.25, "lng": -75.57, "frac_pop": 0.10, "frac_pib": 0.12, "cultura": "colombiana", "lealdade_offset": 3, "recursos": ["indústria", "têxtil"], "valor_estrategico": 3},
        {"id": "CAL", "nome": "Cali", "lat": 3.45, "lng": -76.53, "frac_pop": 0.07, "frac_pib": 0.06, "cultura": "colombiana", "lealdade_offset": 0, "recursos": ["agrícola", "açúcar"], "valor_estrategico": 2},
    ],
    "CHL": [
        {"id": "VLP", "nome": "Valparaíso", "lat": -33.04, "lng": -71.62, "frac_pop": 0.06, "frac_pib": 0.05, "cultura": "chilena", "lealdade_offset": 2, "recursos": ["portos", "turismo"], "valor_estrategico": 3},
        {"id": "CNC", "nome": "Concepción", "lat": -36.82, "lng": -73.05, "frac_pop": 0.06, "frac_pib": 0.05, "cultura": "chilena", "lealdade_offset": 0, "recursos": ["indústria", "madeira"], "valor_estrategico": 2},
    ],
    "PER": [
        {"id": "ARQ", "nome": "Arequipa", "lat": -16.40, "lng": -71.53, "frac_pop": 0.06, "frac_pib": 0.06, "cultura": "peruana", "lealdade_offset": 4, "recursos": ["mineração", "agrícola"], "valor_estrategico": 3},
        {"id": "TRU", "nome": "Trujillo", "lat": -8.11, "lng": -79.03, "frac_pop": 0.04, "frac_pib": 0.03, "cultura": "peruana", "lealdade_offset": 2, "recursos": ["agrícola", "pesca"], "valor_estrategico": 2},
    ],
    "CAN": [
        {"id": "TOR", "nome": "Toronto", "lat": 43.65, "lng": -79.38, "frac_pop": 0.14, "frac_pib": 0.18, "cultura": "canadense", "lealdade_offset": 4, "recursos": ["finanças", "tecnologia"], "valor_estrategico": 4},
        {"id": "MTL", "nome": "Montreal", "lat": 45.50, "lng": -73.57, "frac_pop": 0.08, "frac_pib": 0.10, "cultura": "quebecense", "lealdade_offset": -2, "recursos": ["aeroespacial", "tecnologia"], "valor_estrategico": 3},
    ],
    # --- África (prioridade do utilizador) ---
    "AGO": [
        {"id": "BGU", "nome": "Benguela", "lat": -12.78, "lng": 13.87, "frac_pop": 0.07, "frac_pib": 0.06, "cultura": "ovimbundu", "lealdade_offset": 0, "recursos": ["portos", "pesca", "agrícola"], "valor_estrategico": 4},
        {"id": "HUA", "nome": "Huíla", "lat": -14.92, "lng": 13.46, "frac_pop": 0.05, "frac_pib": 0.04, "cultura": "nvanyeka", "lealdade_offset": -2, "recursos": ["agrícola", "gado"], "valor_estrategico": 2},
        {"id": "CAB", "nome": "Cabinda", "lat": -5.55, "lng": 12.19, "frac_pop": 0.02, "frac_pib": 0.10, "cultura": "fiote", "lealdade_offset": -10, "recursos": ["petróleo"], "valor_estrategico": 5},
    ],
    "MOZ": [
        {"id": "BRA", "nome": "Beira", "lat": -19.84, "lng": 34.84, "frac_pop": 0.05, "frac_pib": 0.06, "cultura": "sena", "lealdade_offset": 2, "recursos": ["portos", "corredor logístico"], "valor_estrategico": 4},
        {"id": "NPU", "nome": "Nampula", "lat": -15.12, "lng": 39.27, "frac_pop": 0.08, "frac_pib": 0.05, "cultura": "macua", "lealdade_offset": 0, "recursos": ["algodão", "agricultura"], "valor_estrategico": 2},
    ],
    "ZAF": [
        {"id": "JNB", "nome": "Joanesburgo", "lat": -26.20, "lng": 28.05, "frac_pop": 0.08, "frac_pib": 0.14, "cultura": "zulu", "lealdade_offset": 0, "recursos": ["ouro", "finanças", "indústria"], "valor_estrategico": 5},
        {"id": "CPT", "nome": "Cidade do Cabo", "lat": -33.92, "lng": 18.42, "frac_pop": 0.06, "frac_pib": 0.08, "cultura": "afrikaans", "lealdade_offset": -3, "recursos": ["turismo", "portos", "tecnologia"], "valor_estrategico": 4},
    ],
    "EGY": [
        {"id": "ALX", "nome": "Alexandria", "lat": 31.20, "lng": 29.92, "frac_pop": 0.10, "frac_pib": 0.12, "cultura": "árabe-egípcia", "lealdade_offset": 2, "recursos": ["portos", "turismo", "indústria"], "valor_estrategico": 4},
        {"id": "GIS", "nome": "Giza", "lat": 30.01, "lng": 31.21, "frac_pop": 0.10, "frac_pib": 0.06, "cultura": "árabe-egípcia", "lealdade_offset": 0, "recursos": ["turismo"], "valor_estrategico": 3},
    ],
    "COD": [
        {"id": "LUB", "nome": "Lubumbashi", "lat": -11.69, "lng": 27.53, "frac_pop": 0.07, "frac_pib": 0.15, "cultura": "lubakat", "lealdade_offset": -3, "recursos": ["cobre", "cobalto", "mineração"], "valor_estrategico": 5},
        {"id": "GOM", "nome": "Goma", "lat": -1.68, "lng": 29.22, "frac_pop": 0.04, "frac_pib": 0.03, "cultura": "nyarwanda", "lealdade_offset": -8, "recursos": ["coltan", "agrícola"], "valor_estrategico": 3},
    ],
    "CMR": [
        {"id": "DLA", "nome": "Douala", "lat": 4.05, "lng": 9.70, "frac_pop": 0.13, "frac_pib": 0.20, "cultura": "duala", "lealdade_offset": 0, "recursos": ["portos", "petróleo", "indústria"], "valor_estrategico": 5},
        {"id": "BAF", "nome": "Bafoussam", "lat": 5.48, "lng": 10.42, "frac_pop": 0.06, "frac_pib": 0.04, "cultura": "bamileke", "lealdade_offset": 3, "recursos": ["agrícola", "café"], "valor_estrategico": 2},
    ],
    "CIV": [
        {"id": "YMS", "nome": "Yamoussoukro", "lat": 6.83, "lng": -5.30, "frac_pop": 0.05, "frac_pib": 0.04, "cultura": "baulé", "lealdade_offset": 2, "recursos": ["agrícola"], "valor_estrategico": 2},
    ],
    "SEN": [
        {"id": "TIE", "nome": "Touba", "lat": 14.85, "lng": -15.89, "frac_pop": 0.07, "frac_pib": 0.04, "cultura": "uolofe", "lealdade_offset": 5, "recursos": ["turismo religioso"], "valor_estrategico": 2},
    ],
    "UGA": [
        {"id": "ENT", "nome": "Entebbe", "lat": 0.06, "lng": 32.46, "frac_pop": 0.05, "frac_pib": 0.04, "cultura": "ganda", "lealdade_offset": 3, "recursos": ["turismo", "pesca"], "valor_estrategico": 2},
        {"id": "GUL", "nome": "Gulu", "lat": 2.78, "lng": 32.30, "frac_pop": 0.04, "frac_pib": 0.02, "cultura": "acholi", "lealdade_offset": -5, "recursos": ["agrícola"], "valor_estrategico": 2},
    ],
    "MDG": [
        {"id": "TOL", "nome": "Toamasina", "lat": -18.15, "lng": 49.40, "frac_pop": 0.08, "frac_pib": 0.07, "cultura": "betsimisaraka", "lealdade_offset": 2, "recursos": ["portos", "vanilha"], "valor_estrategico": 3},
    ],
    "ZMB": [
        {"id": "NDO", "nome": "Ndola", "lat": -12.96, "lng": 28.64, "frac_pop": 0.10, "frac_pib": 0.13, "cultura": "bemba", "lealdade_offset": 0, "recursos": ["cobre", "cobalto"], "valor_estrategico": 4},
    ],
    "SOM": [
        {"id": "KIS", "nome": "Kismayo", "lat": -0.36, "lng": 42.55, "frac_pop": 0.06, "frac_pib": 0.04, "cultura": "somali", "lealdade_offset": -10, "recursos": ["portos", "pesca"], "valor_estrategico": 3},
    ],
    "MLI": [
        {"id": "Sik", "nome": "Sikasso", "lat": 11.32, "lng": -5.67, "frac_pop": 0.07, "frac_pib": 0.06, "cultura": "bambara", "lealdade_offset": -3, "recursos": ["algodão", "agrícola"], "valor_estrategico": 2},
    ],
    "NER": [
        {"id": "ZND", "nome": "Zinder", "lat": 13.81, "lng": 8.99, "frac_pop": 0.10, "frac_pib": 0.05, "cultura": "hauçá", "lealdade_offset": -5, "recursos": ["agrícola", "gado"], "valor_estrategico": 2},
        {"id": "AGD", "nome": "Agadez", "lat": 16.97, "lng": 7.99, "frac_pop": 0.03, "frac_pib": 0.10, "cultura": "tuaregue", "lealdade_offset": -8, "recursos": ["urânio"], "valor_estrategico": 4},
    ],
    "BFA": [
        {"id": "BOB", "nome": "Bobo-Dioulasso", "lat": 11.17, "lng": -4.30, "frac_pop": 0.10, "frac_pib": 0.08, "cultura": "jula", "lealdade_offset": 0, "recursos": ["agrícola", "indústria"], "valor_estrategico": 2},
    ],
    "ETH": [
        {"id": "ADR", "nome": "Adama", "lat": 8.54, "lng": 39.27, "frac_pop": 0.08, "frac_pib": 0.06, "cultura": "oromo", "lealdade_offset": -5, "recursos": ["agrícola", "logística"], "valor_estrategico": 2},
        {"id": "GON", "nome": "Gondar", "lat": 12.60, "lng": 37.47, "frac_pop": 0.07, "frac_pib": 0.04, "cultura": "amara", "lealdade_offset": -3, "recursos": ["turismo", "agrícola"], "valor_estrategico": 2},
    ],
    "KEN": [
        {"id": "MBA", "nome": "Mombaça", "lat": -4.04, "lng": 39.66, "frac_pop": 0.07, "frac_pib": 0.10, "cultura": "swahili", "lealdade_offset": 0, "recursos": ["portos", "turismo"], "valor_estrategico": 4},
        {"id": "KSM", "nome": "Kisumu", "lat": -0.09, "lng": 34.77, "frac_pop": 0.04, "frac_pib": 0.03, "cultura": "luo", "lealdade_offset": -2, "recursos": ["pesca", "agrícola"], "valor_estrategico": 2},
    ],
    "ZWE": [
        {"id": "BUL", "nome": "Bulavaio", "lat": -20.15, "lng": 28.58, "frac_pop": 0.10, "frac_pib": 0.10, "cultura": "ndebele", "lealdade_offset": -5, "recursos": ["indústria", "mineração"], "valor_estrategico": 3},
    ],
    "SDN": [
        {"id": "OBD", "nome": "Ondurmã", "lat": 15.65, "lng": 32.48, "frac_pop": 0.15, "frac_pib": 0.10, "cultura": "árabe-sudanesa", "lealdade_offset": -8, "recursos": ["indústria", "comércio"], "valor_estrategico": 3},
        {"id": "PTZ", "nome": "Port Sudão", "lat": 19.62, "lng": 37.22, "frac_pop": 0.03, "frac_pib": 0.05, "cultura": "beja", "lealdade_offset": -3, "recursos": ["portos", "petróleo"], "valor_estrategico": 4},
    ],
    "TUN": [
        {"id": "SFX", "nome": "Sfax", "lat": 34.74, "lng": 10.76, "frac_pop": 0.10, "frac_pib": 0.10, "cultura": "árabe-tunisina", "lealdade_offset": 2, "recursos": ["portos", "agricultura", "fosfatos"], "valor_estrategico": 3},
    ],
    "DZA": [
        {"id": "ORN", "nome": "Orão", "lat": 35.70, "lng": -0.64, "frac_pop": 0.10, "frac_pib": 0.08, "cultura": "árabe-argelina", "lealdade_offset": 2, "recursos": ["portos", "indústria"], "valor_estrategico": 3},
        {"id": "CST", "nome": "Constantina", "lat": 36.37, "lng": 6.61, "frac_pop": 0.06, "frac_pib": 0.04, "cultura": "árabe-argelina", "lealdade_offset": 3, "recursos": ["agrícola", "comércio"], "valor_estrategico": 2},
    ],
    "MAR": [
        {"id": "CAS", "nome": "Casablanca", "lat": 33.59, "lng": -7.59, "frac_pop": 0.13, "frac_pib": 0.20, "cultura": "árabe-marroquina", "lealdade_offset": 0, "recursos": ["portos", "indústria", "finanças"], "valor_estrategico": 5},
        {"id": "MAR", "nome": "Marrakech", "lat": 31.62, "lng": -7.98, "frac_pop": 0.06, "frac_pib": 0.07, "cultura": "árabe-marroquina", "lealdade_offset": 4, "recursos": ["turismo", "agrícola"], "valor_estrategico": 3},
    ],
    "ISR": [
        {"id": "TLV", "nome": "Telavive", "lat": 32.09, "lng": 34.78, "frac_pop": 0.20, "frac_pib": 0.30, "cultura": "israelita", "lealdade_offset": 3, "recursos": ["tecnologia", "finanças"], "valor_estrategico": 5},
        {"id": "HFA", "nome": "Haifa", "lat": 32.79, "lng": 34.99, "frac_pop": 0.09, "frac_pib": 0.10, "cultura": "israelita", "lealdade_offset": 2, "recursos": ["portos", "petroquímica"], "valor_estrategico": 4},
    ],
    "AUS": [
        {"id": "SYD", "nome": "Sidney", "lat": -33.87, "lng": 151.21, "frac_pop": 0.20, "frac_pib": 0.22, "cultura": "australiana", "lealdade_offset": 3, "recursos": ["finanças", "turismo", "portos"], "valor_estrategico": 4},
        {"id": "MEL", "nome": "Melbourne", "lat": -37.81, "lng": 144.96, "frac_pop": 0.17, "frac_pib": 0.16, "cultura": "australiana", "lealdade_offset": 4, "recursos": ["finanças", "indústria"], "valor_estrategico": 3},
    ],
}

def main():
    with open(SCENARIO_PATH, encoding="utf-8") as f:
        scenario = json.load(f)
    with open(COUNTRIES_PATH, encoding="utf-8") as f:
        countries = {c["id"]: c for c in json.load(f)["paises"]}

    existing_ids = {p["id"] for p in scenario["provincias"]}
    new_provs = []
    added = 0

    for cid, regions in REGIONAL.items():
        country = countries.get(cid)
        if not country:
            print(f"Aviso: país {cid} não encontrado em countries.json", file=sys.stderr)
            continue
        base_estab = country["estabilidade"]
        for reg in regions:
            pid = f"{cid}-{reg['id']}"
            if pid in existing_ids:
                continue  # já existe, não duplicar
            pop = int(country["populacao"] * reg["frac_pop"])
            pib = country["pib"] * reg["frac_pib"]
            lealdade = max(0, min(100, base_estab + reg["lealdade_offset"]))
            prov = {
                "id": pid,
                "nome": reg["nome"],
                "countryId": cid,
                "populacao": pop,
                "pib": pib,
                "ocupadaPor": None,
                "lat": reg["lat"],
                "lng": reg["lng"],
                "cultura": reg["cultura"],
                "lealdade": lealdade,
                "recursos": reg["recursos"],
                "valorEstrategico": reg["valor_estrategico"],
            }
            new_provs.append(prov)
            existing_ids.add(pid)
            added += 1

    scenario["provincias"].extend(new_provs)
    # Atualiza descrição
    scenario["descricao"] = (
        "Cenário de partida: ordem geopolítica contemporânea em 2025 com 57 países "
        "detalhados (dados realistas: população, PIB, orçamento militar, tropas, "
        "nuclear, blocos, líder) e ~150 províncias/regiões com cultura, lealdade e "
        "valor estratégico. Países adicionais do mapa aparecem a cinzento com a "
        "etiqueta «sem dados». Valores aproximados e plausíveis."
    )
    with open(SCENARIO_PATH, "w", encoding="utf-8") as f:
        json.dump(scenario, f, ensure_ascii=False, indent=2)
    print(f"Adicionadas {added} províncias regionais. Total agora: {len(scenario['provincias'])}.")

if __name__ == "__main__":
    main()
