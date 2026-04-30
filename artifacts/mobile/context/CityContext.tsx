import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

const STORAGE_KEY = "@royvento/selected_city";

interface CityContextValue {
  selectedCity: string;
  setSelectedCity: (city: string) => void;
}

const CityContext = createContext<CityContextValue>({
  selectedCity: "",
  setSelectedCity: () => {},
});

export function useSelectedCity() {
  return useContext(CityContext);
}

export function CityProvider({ children }: { children: React.ReactNode }) {
  const [selectedCity, setSelectedCityState] = useState("");

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((val) => {
        if (val) setSelectedCityState(val);
      })
      .catch(() => {});
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
    <CityContext.Provider value={{ selectedCity, setSelectedCity }}>
      {children}
    </CityContext.Provider>
  );
}
