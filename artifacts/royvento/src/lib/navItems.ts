// Canonical list of primary navigation items, shared by the Navbar (which
// renders them) and the admin panel (which toggles their visibility). `key` is
// the stable identifier persisted in site_settings → hidden_nav_links; never
// rename a key once shipped or existing hide settings will silently reset.
export interface NavItemDef {
  key: string;
  href: string;
  /** i18n key used by the navbar. */
  labelKey: string;
  /** English fallback — also used as the admin-panel label. */
  label: string;
}

export const NAV_ITEMS: NavItemDef[] = [
  { key: "home", href: "/", labelKey: "nav.home", label: "Home" },
  { key: "tonight-plans", href: "/tonight-plans", labelKey: "nav.tonight_plans", label: "Tonight Plans" },
  { key: "pubs", href: "/pubs", labelKey: "nav.pubs", label: "Pubs & Clubs" },
  { key: "events", href: "/events", labelKey: "nav.events", label: "Events" },
  { key: "games", href: "/games", labelKey: "nav.games", label: "Games & Sports" },
  { key: "pub-offers", href: "/pub-offers", labelKey: "nav.pub_offers", label: "Happy Hours" },
  { key: "solo-connect", href: "/solo-connect", labelKey: "nav.solo_connect", label: "Solo Connect" },
  { key: "private-parties", href: "/private-parties", labelKey: "nav.private_parties", label: "Create & Join Private Parties" },
];

export const NAV_ITEM_KEYS = NAV_ITEMS.map((i) => i.key);
