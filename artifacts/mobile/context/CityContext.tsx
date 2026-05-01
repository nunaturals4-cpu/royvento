import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { COUNTRIES } from "@/utils/locations";

const STORAGE_KEY = "@royvento/selected_city";
const AUTO_ATTEMPTED_KEY = "@royvento/location_auto_attempted";

const ALL_CITIES: string[] = Array.from(
  new Set(
    COUNTRIES.flatMap((country) =>
      country.states.flatMap((state) => state.cities)
    )
  )
);

function matchCity(geocodedCity: string): string {
  const normalized = geocodedCity.trim().toLowerCase();
  return (
    ALL_CITIES.find((c) => c.toLowerCase() === normalized) ??
    ALL_CITIES.find((c) => normalized.includes(c.toLowerCase())) ??
    ALL_CITIES.find((c) => c.toLowerCase().includes(normalized)) ??
    ""
  );
}

interface CityContextValue {
  selectedCity: string;
  setSelectedCity: (city: string) => void;
  detectingCity: boolean;
}

const CityContext = createContext<CityContextValue>({
  selectedCity: "",
  setSelectedCity: () => {},
  detectingCity: false,
});

export function useSelectedCity() {
  return useContext(CityContext);
}

export function CityProvider({ children }: { children: React.ReactNode }) {
  const [selectedCity, setSelectedCityState] = useState("");
  const [detectingCity, setDetectingCity] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored) {
          setSelectedCityState(stored);
          return;
        }

        const alreadyAttempted = await AsyncStorage.getItem(AUTO_ATTEMPTED_KEY);
        if (alreadyAttempted) return;

        await AsyncStorage.setItem(AUTO_ATTEMPTED_KEY, "1");

        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") return;

        setDetectingCity(true);
        const coords = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        const [place] = await Location.reverseGeocodeAsync({
          latitude: coords.coords.latitude,
          longitude: coords.coords.longitude,
        });

        const candidates = [place?.city, place?.subregion, place?.region].filter(Boolean) as string[];
        let matched = "";
        for (const candidate of candidates) {
          matched = matchCity(candidate);
          if (matched) break;
        }

        if (matched) {
          setSelectedCityState(matched);
          await AsyncStorage.setItem(STORAGE_KEY, matched);
        }
      } catch {
      } finally {
        setDetectingCity(false);
      }
    })();
  }, []);

  const setSelectedCity = useCallback((city: string) => {
    setSelectedCityState(city);
    if (city) {
      AsyncStorage.setItem(STORAGE_KEY, city).catch(() => {});
    } else {
      AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
    }
  }, []);

  return (
    <CityContext.Provider value={{ selectedCity, setSelectedCity, detectingCity }}>
      {children}
    </CityContext.Provider>
  );
}
