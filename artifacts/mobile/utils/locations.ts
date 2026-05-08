export interface CountryData {
  name: string;
  states: { name: string; cities: string[] }[];
}

const RAW_COUNTRIES: CountryData[] = [
  {
    name: "India",
    states: [
      { name: "West Bengal", cities: ["Kolkata", "Howrah", "Siliguri", "Durgapur", "Asansol", "Darjeeling"] },
      { name: "Maharashtra", cities: ["Mumbai", "Pune", "Nagpur", "Nashik", "Aurangabad", "Thane"] },
      { name: "Karnataka", cities: ["Bengaluru", "Mysuru", "Mangaluru", "Hubballi", "Belagavi"] },
      { name: "Delhi", cities: ["New Delhi", "South Delhi", "North Delhi", "Dwarka", "Rohini"] },
      { name: "Tamil Nadu", cities: ["Chennai", "Coimbatore", "Madurai", "Tiruchirappalli", "Salem"] },
      { name: "Telangana", cities: ["Hyderabad", "Warangal", "Karimnagar", "Nizamabad"] },
      { name: "Gujarat", cities: ["Ahmedabad", "Surat", "Vadodara", "Rajkot", "Gandhinagar"] },
      { name: "Rajasthan", cities: ["Jaipur", "Udaipur", "Jodhpur", "Ajmer", "Bikaner"] },
      { name: "Uttar Pradesh", cities: ["Lucknow", "Kanpur", "Varanasi", "Agra", "Noida", "Ghaziabad"] },
      { name: "Punjab", cities: ["Chandigarh", "Amritsar", "Ludhiana", "Jalandhar", "Patiala"] },
      { name: "Kerala", cities: ["Kochi", "Thiruvananthapuram", "Kozhikode", "Thrissur"] },
      { name: "Goa", cities: ["Panaji", "Margao", "Vasco da Gama", "Mapusa"] },
      { name: "Madhya Pradesh", cities: ["Bhopal", "Indore", "Gwalior", "Jabalpur"] },
      { name: "Haryana", cities: ["Gurugram", "Faridabad", "Panipat", "Karnal"] },
      { name: "Andhra Pradesh", cities: ["Visakhapatnam", "Vijayawada", "Tirupati", "Guntur"] },
      { name: "Odisha", cities: ["Bhubaneswar", "Cuttack", "Puri", "Rourkela"] },
      { name: "Assam", cities: ["Guwahati", "Dibrugarh", "Silchar", "Jorhat"] },
      { name: "Bihar", cities: ["Patna", "Gaya", "Bhagalpur", "Muzaffarpur"] },
    ],
  },
  {
    name: "United Arab Emirates",
    states: [
      { name: "Dubai", cities: ["Dubai", "Jebel Ali"] },
      { name: "Abu Dhabi", cities: ["Abu Dhabi", "Al Ain"] },
      { name: "Sharjah", cities: ["Sharjah"] },
    ],
  },
  {
    name: "United States",
    states: [
      { name: "California", cities: ["Los Angeles", "San Francisco", "San Diego", "San Jose"] },
      { name: "New York", cities: ["New York City", "Buffalo", "Rochester"] },
      { name: "Texas", cities: ["Houston", "Dallas", "Austin", "San Antonio"] },
      { name: "Florida", cities: ["Miami", "Orlando", "Tampa"] },
    ],
  },
  {
    name: "United Kingdom",
    states: [
      { name: "England", cities: ["London", "Manchester", "Birmingham", "Liverpool", "Bristol"] },
      { name: "Scotland", cities: ["Edinburgh", "Glasgow"] },
      { name: "Wales", cities: ["Cardiff", "Swansea"] },
    ],
  },
  {
    name: "Canada",
    states: [
      { name: "Ontario", cities: ["Toronto", "Ottawa", "Mississauga"] },
      { name: "British Columbia", cities: ["Vancouver", "Victoria", "Surrey"] },
      { name: "Quebec", cities: ["Montreal", "Quebec City"] },
    ],
  },
  {
    name: "Australia",
    states: [
      { name: "New South Wales", cities: ["Sydney", "Newcastle"] },
      { name: "Victoria", cities: ["Melbourne", "Geelong"] },
      { name: "Queensland", cities: ["Brisbane", "Gold Coast"] },
    ],
  },
  {
    name: "Singapore",
    states: [{ name: "Singapore", cities: ["Singapore"] }],
  },
];

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
const sortStr = (a: string, b: string) => a.localeCompare(b);

export const COUNTRIES: CountryData[] = [...RAW_COUNTRIES]
  .sort(byName)
  .map((c) => ({
    ...c,
    states: [...c.states]
      .sort(byName)
      .map((s) => ({ ...s, cities: [...s.cities].sort(sortStr) })),
  }));

export const COUNTRY_NAMES = COUNTRIES.map((c) => c.name);

export function getStates(country: string): string[] {
  const c = COUNTRIES.find((x) => x.name === country);
  return c ? c.states.map((s) => s.name) : [];
}

export function getCities(country: string, state: string): string[] {
  const c = COUNTRIES.find((x) => x.name === country);
  if (!c) return [];
  const s = c.states.find((x) => x.name === state);
  return s ? s.cities : [];
}
