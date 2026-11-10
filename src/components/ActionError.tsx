const MESSAGES: Record<string, string> = {
  duplicate: "That name already exists.",
  invalid: "Check the details and try again.",
  season_format: "Season names use the format YY/YY, for example 25/26.",
  not_found: "That item no longer exists. Reload and try again.",
  player_has_games: "This player has recorded games and cannot be deleted. Deactivate them instead.",
  fixture_has_games: "Remove this fixture's matches before deleting it.",
  session_active: "Finish or abandon the game in progress before deleting this session.",
  no_players: "Choose at least one player."
};

/** Shows the message for an `?error=` code set by a server action. */
export function ActionError({ code }: { code?: string }) {
  if (!code) return null;
  return (
    <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700" role="alert">
      {MESSAGES[code] ?? "That did not work. Try again."}
    </p>
  );
}
