import Link from "next/link";
import { getPlayers } from "@/data/players";
import { get121PlayerStats, getActive121Sessions } from "@/data/game121";
import { start121GameAction } from "./actions";
import styles from "./game121.module.css";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Game121Page() {
  const [players,stats,active]=await Promise.all([getPlayers(),get121PlayerStats(),getActive121Sessions()]);
  return <main className={styles.shell}>
    <header className={styles.header}><div><p className={styles.eyebrow}>Practice arena</p><h1>121 Challenge</h1></div><Link href="/practice" className={styles.secondary}>‹ Practice</Link></header>
    <p className={styles.muted}>Work from 121 to 170, with checkout guidance and three visits per target.</p>
    {active.length>0 && <section className={styles.panel}><h2>Resume a saved game</h2><div className={styles.resume}>
      {active.map(s=><Link key={s.id} href={"/practice/121/scoring?session="+s.id}>
        <span><strong>{s.player?.name || "Player"}</strong><span className="block text-xs">Target {s.current_checkout} · {s.remaining} left · Visit {s.current_turn}/3</span></span><span>Resume →</span>
      </Link>)}
    </div><p className={styles.muted}>Your five most recently started active games.</p></section>}
    <section className={styles.panel}>
      <h2>Start a game</h2>
      <form action={start121GameAction} className={styles.setup}>
        <label htmlFor="playerId">Player</label><select id="playerId" name="playerId" required>
          <option value="">Choose a player</option>{players.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <label className={styles.check}><input type="checkbox" name="advanceBaseOnAnyFinish"/>
          <span><strong>Advance base on any finish</strong><span className="block text-xs">Lock each completed target, even when you finish in visit 2 or 3.</span></span>
        </label>
        <button type="submit" className={styles.primary}>Start 121</button>
      </form>
    </section>
    <details className={styles.panel}><summary>How to play</summary><div className={styles.help}>
      <p>Start on 121 and work up to 170. Each target allows three visits of up to three darts.</p>
      <p>Finish in visit 1 to lock the completed checkout as your base. Finish in visit 2 or 3 to advance the target while your base stays unchanged.</p>
      <p>If you do not finish within three visits, return to your locked base. Bogey targets such as 159 need a setup before a later visit can finish.</p>
      <p>With “Advance base on any finish”, any successful visit locks the completed checkout as your base.</p>
      <p>Enter each visit total after throwing, and confirm a double or Bull when you finish. A miss scores zero. A bust keeps the starting remaining score and uses the visit.</p>
      <p>Games are saved after each visit. Use Back during scoring to leave a game available to resume.</p>
    </div></details>
    {stats.length>0 && <details className={styles.panel}><summary>Player records</summary><div className={styles.stats}>
      {stats.map(p=><div key={p.player_id} className={styles.turnRow}><div><strong>{p.name}</strong>
        <span>Best finished target: {p.best_checkout ?? "–"} · First-visit finishes: {p.lock_rate===null?"–":p.lock_rate+"%"}</span>
      </div><span>{p.games_won} won · {p.games_played} played</span></div>)}
    </div></details>}
  </main>;
}
