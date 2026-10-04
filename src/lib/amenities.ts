import {
  AirVent,
  Baby,
  Coffee,
  CookingPot,
  Flame,
  Laptop,
  Leaf,
  MoonStar,
  Mountain,
  PawPrint,
  PlugZap,
  ShowerHead,
  Sparkles,
  SquareParking,
  Sunset,
  Trees,
  Tv,
  WashingMachine,
  Waves,
  Wifi,
  type LucideIcon,
} from "lucide-react";

export interface Amenity {
  key: string;
  label: string;
  labelMs?: string;
  icon: LucideIcon;
}

export function amenityLabel(a: Amenity, locale: "en" | "ms"): string {
  return locale === "ms" && a.labelMs ? a.labelMs : a.label;
}

/** Canonical amenity catalog. Keys are stored in properties.amenities (text[]). */
export const AMENITIES: readonly Amenity[] = [
  { key: "wifi", label: "Fast Wi-Fi", labelMs: "Wi-Fi laju", icon: Wifi },
  { key: "air_conditioning", label: "Air conditioning", labelMs: "Penghawa dingin", icon: AirVent },
  { key: "kitchen", label: "Full kitchen", labelMs: "Dapur lengkap", icon: CookingPot },
  { key: "pool", label: "Private pool", labelMs: "Kolam renang persendirian", icon: Waves },
  { key: "free_parking", label: "Free parking", labelMs: "Parkir percuma", icon: SquareParking },
  { key: "washer", label: "Washer", labelMs: "Mesin basuh", icon: WashingMachine },
  { key: "workspace", label: "Dedicated workspace", labelMs: "Ruang kerja khas", icon: Laptop },
  { key: "bbq", label: "BBQ grill", labelMs: "Pemanggang BBQ", icon: Flame },
  { key: "garden", label: "Garden", labelMs: "Taman", icon: Trees },
  { key: "hot_water", label: "Hot shower", labelMs: "Pancuran air panas", icon: ShowerHead },
  { key: "family_friendly", label: "Family friendly", labelMs: "Mesra keluarga", icon: Baby },
  { key: "pet_friendly", label: "Pets allowed", labelMs: "Haiwan peliharaan dibenarkan", icon: PawPrint },
  { key: "breakfast", label: "Breakfast included", labelMs: "Sarapan disediakan", icon: Coffee },
  { key: "tv", label: "Smart TV", labelMs: "TV pintar", icon: Tv },
  { key: "ev_charger", label: "EV charger", labelMs: "Pengecas EV", icon: PlugZap },
  { key: "mountain_view", label: "Mountain view", labelMs: "Pemandangan gunung", icon: Mountain },
  { key: "sea_view", label: "Sea view", labelMs: "Pemandangan laut", icon: Sunset },
  { key: "prayer_space", label: "Prayer space", labelMs: "Ruang solat", icon: MoonStar },
  { key: "eco", label: "Eco-friendly", labelMs: "Mesra alam", icon: Leaf },
] as const;

const BY_KEY = new Map(AMENITIES.map((a) => [a.key, a]));

export function getAmenity(key: string): Amenity {
  return (
    BY_KEY.get(key) ?? {
      key,
      label: key.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()),
      icon: Sparkles,
    }
  );
}
