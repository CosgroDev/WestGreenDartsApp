import { nanoid } from "nanoid";

export const mockPlayers = [
  { id: nanoid(), name: "Alice Carter", active: true },
  { id: nanoid(), name: "Ben Hughes", active: true },
  { id: nanoid(), name: "Chloe Turner", active: true }
];

export const mockFixtures = [
  {
    id: nanoid(),
    season: "25/26",
    starts_at: "2026-02-03T19:30:00Z",
    home: true,
    opponent: "Kings Arms",
    venue: "West Green Social",
    notes: "League match",
    games: []
  },
  {
    id: nanoid(),
    season: "25/26",
    starts_at: "2026-02-10T19:30:00Z",
    home: false,
    opponent: "Crown & Anchor",
    venue: "Crown & Anchor",
    notes: "",
    games: []
  }
];
