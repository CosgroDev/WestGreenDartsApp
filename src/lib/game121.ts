import { finishRoutes } from "./finishRoutes";
import { canFinishFrom } from "./scoringUtils";

export type Game121Session = {
  revision: number; base_checkout: number; current_checkout: number; current_turn: number;
  remaining: number; status: string; advance_base_on_any_finish?: boolean;
  player?: { name: string } | null;
};
export type Game121Turn = {
  id: number; checkout: number; turn_number: number; score: number;
  remaining_before: number; remaining_after: number; is_bust: boolean; result: string | null;
};
export type DartAim = { label: string; description: string; score: number };
export type CheckoutGuide = { kind: "finish" | "setup" | "none"; targets: DartAim[]; leave: number };
const aim = (label: string): DartAim => {
  if (label === "Bull") return { label, description: "Bull (50)", score: 50 };
  if (label === "25") return { label, description: "Outer bull (25)", score: 25 };
  const match = /^([TDS]?)(\d+)$/.exec(label);
  if (!match) throw new Error("Invalid dart target");
  const n=Number(match[2]),type=match[1]||"S";
  return { label:type+n,description:(type==="T"?"Treble ":type==="D"?"Double ":"Single ")+n,score:n*(type==="T"?3:type==="D"?2:1) };
};
const doubles=[20,16,18,12,10,8,14,6,4,2,1,19,17,15,13,11,9,7,5,3].map(n=>aim("D"+n)).concat(aim("Bull"));
const setups=[
  ...Array.from({length:20},(_,i)=>aim("T"+(20-i))),
  ...Array.from({length:20},(_,i)=>aim("S"+(20-i))),
  aim("25"),aim("Bull"),
];
const allScoring=[...setups,...doubles];
const preferred:Record<number,string>={
  ...finishRoutes,
  61:"T15 D8",63:"T13 D12",65:"25 D20",67:"T17 D8",69:"T19 D6",
  71:"T13 D16",73:"T19 D8",75:"T17 D12",77:"T19 D10",79:"T13 D20",
  81:"T19 D12",83:"T17 D16",85:"T15 D20",87:"T17 D18",89:"T19 D16",
  91:"T17 D20",93:"T19 D18",97:"T19 D20",99:"T19 S10 D16",
  101:"T17 Bull",103:"T17 S20 D16",105:"T19 S16 D16",107:"T19 S18 D16",
  109:"T19 S20 D16",111:"T19 S14 D20",113:"T19 S16 D20",115:"T19 S18 D20",
  117:"T19 S20 D20",119:"T20 S19 D20",
  121:"T20 T11 D14",123:"T19 T16 D9",125:"25 T20 D20",127:"T20 T17 D8",
  129:"T19 T16 D12",131:"T20 T13 D16",133:"T20 T19 D8",135:"25 T20 Bull",
  139:"T20 T13 D20",143:"T20 T17 D16",
};
function findTotal(total:number,darts:number,pool:DartAim[]):DartAim[]|null {
  const byScore=new Map<number,DartAim>();
  for(const target of pool)if(!byScore.has(target.score))byScore.set(target.score,target);
  if(byScore.has(total))return [byScore.get(total)!];
  if(darts>=2)for(const first of pool){
    const second=byScore.get(total-first.score);
    if(second)return [first,second];
  }
  if(darts>=3)for(const first of pool)for(const second of pool){
    const third=byScore.get(total-first.score-second.score);
    if(third)return [first,second,third];
  }
  return null;
}
function finish(remaining:number,darts:number):DartAim[]|null {
  if(!canFinishFrom(remaining,darts))return null;
  const known=preferred[remaining]?.split(" ").map(aim);
  if(known&&known.length<=darts)return known;
  const one=doubles.find(d=>d.score===remaining);
  if(one)return [one];
  for(let count=1;count<darts;count++)for(const last of doubles){
    const before=findTotal(remaining-last.score,count,allScoring);
    if(before&&before.length<=count)return [...before,last];
  }
  return null;
}
const guideCache=new Map<string,CheckoutGuide>();
export function get121CheckoutGuide(remaining:number,darts=3):CheckoutGuide {
  if(!Number.isInteger(remaining)||remaining<2||remaining>170||!Number.isInteger(darts)||darts<1||darts>3)
    return {kind:"none",targets:[],leave:remaining};
  const key=remaining+":"+darts,cached=guideCache.get(key);
  if(cached)return cached;
  const route=finish(remaining,darts);
  if(route){
    const guide:CheckoutGuide={kind:"finish",targets:route,leave:0};
    guideCache.set(key,guide);return guide;
  }
  // Bogeys and shorter miss routes need a setup, never a false checkout.
  for(const leave of [32,40,24,16]){
    if(remaining<=leave)continue;
    const route=findTotal(remaining-leave,darts,setups);
    if(route){
      const guide:CheckoutGuide={kind:"setup",targets:route,leave};
      guideCache.set(key,guide);return guide;
    }
  }
  const target=setups.find(t=>t.score<remaining-1&&canFinishFrom(remaining-t.score));
  const guide:CheckoutGuide=target?{kind:"setup",targets:[target],leave:remaining-target.score}:{kind:"none",targets:[],leave:remaining};
  guideCache.set(key,guide);return guide;
}
export function get121SingleMissGuide(remaining:number,guide=get121CheckoutGuide(remaining)) {
  const first=guide.targets[0];
  if(!first)return null;
  const single=first.label.startsWith("T")?aim("S"+first.label.slice(1)):first.label==="Bull"?aim("25"):first.label==="25"?aim("Bull"):null;
  if(!single||remaining-single.score<2)return null;
  return {hit:single,remaining:remaining-single.score,guide:get121CheckoutGuide(remaining-single.score,2)};
}
export function resolve121Turn(session:Game121Session,score:number,declaredBust=false) {
  if(!Number.isInteger(score)||score<0||score>180)throw new Error("Enter a whole-number score from 0 to 180.");
  const difference=session.remaining-score;
  const isBust=declaredBust||difference<0||difference===1||(difference===0&&!canFinishFrom(session.remaining));
  const remainingAfter=isBust?session.remaining:difference;
  const finished=remainingAfter===0;
  let result:string|null=null;
  const patch={base_checkout:session.base_checkout,current_checkout:session.current_checkout,
    current_turn:session.current_turn,remaining:remainingAfter,status:"in_progress"};
  if(finished){
    if(session.current_checkout>=170){result="won";patch.status="won";}
    else{
      const locks=session.current_turn===1||session.advance_base_on_any_finish===true;
      result=locks?"locked":"progressed";
      if(locks)patch.base_checkout=session.current_checkout;
      patch.current_checkout=session.current_checkout+1;patch.current_turn=1;patch.remaining=patch.current_checkout;
    }
  }else if(session.current_turn===3){
    result="failed";patch.current_checkout=session.base_checkout;patch.current_turn=1;patch.remaining=session.base_checkout;
  }else patch.current_turn=session.current_turn+1;
  return {result,isBust,remainingAfter,finished,patch};
}
