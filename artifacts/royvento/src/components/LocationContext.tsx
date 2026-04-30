import { createContext, useContext, useEffect, useState } from "react";

const STORAGE_KEY = "royvento_city";

interface LocationContextValue {
  selectedCity: string;
  setSelectedCity: (city: string) => void;
}

const LocationContext = createContext<LocationContextValue>({
  selectedCity: "",
  setSelectedCity: () => {},
});

export function useSelectedCity() {
  return useContext(LocationContext);
}

async function reverseGeocode(lat: number, lon: number): Promise<string> {
  const r = await fetch(
    `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`,
    { headers: { "Accept-Language": "en" } }
  );
  const data = await r.json();
  const raw =
    data.address?.city ||
    data.address?.town ||
    data.address?.state_district ||
    data.address?.state ||
    "";
  return raw ? raw.split(",")[0].trim() : "";
}

export function LocationProvider({ children }: { children: React.ReactNode }) {
  const [selectedCity, setSelectedCityState] = useState<string>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) ?? "";
    } catch {
      return "";
    }
  });

  const setSelectedCity = (city: string) => {
    setSelectedCityState(city);
    try {
      if (city) localStorage.setItem(STORAGE_KEY, city);
      else localStorage.removeItem(STORAGE_KEY);
    } catch {}
  };

  useEffect(() => {
    if (selectedCity) return;
    navigator.geolocation?.getCurrentPosition(
      async (pos) => {
        try {
          const stored = localStorage.getItem(STORAGE_KEY);
          if (stored) return;
          const city = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
          if (city && !localStorage.getItem(STORAGE_KEY)) setSelectedCity(city);
        } catch {}
      },
      () => {}
    );
  }, []);

  return (
    <LocationContext.Provider value={{ selectedCity, setSelectedCity }}>
      {children}
    </LocationContext.Provider>
  );
}

export { reverseGeocode };
