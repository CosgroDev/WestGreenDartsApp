import { canFinishFrom } from "../src/lib/scoringUtils";
import { get121CheckoutGuide, get121SingleMissGuide, resolve121Turn, type Game121Session } from "../src/lib/game121";

const session=(overrides:Partial<Game121Session>={}):Game121Session=>({
  revision:0,base_checkout:121,current_checkout:121,current_turn:1,remaining:121,status:"in_progress",...overrides,
});
describe("121 checkout guidance",()=>{
  it("uses a familiar 121 finish and replans after a scored visit",()=>{
    expect(get121CheckoutGuide(121).targets.map(t=>t.label)).toEqual(["T20","T11","D14"]);
    expect(get121CheckoutGuide(61).targets.map(t=>t.label)).toEqual(["T15","D8"]);
    expect(get121CheckoutGuide(32).targets.map(t=>t.label)).toEqual(["D16"]);
  });
  it("gives a legal finish or a safe setup for every remaining score and dart allowance",()=>{
    for(let remaining=2;remaining<=170;remaining++)for(let darts=1;darts<=3;darts++){
      const guide=get121CheckoutGuide(remaining,darts);
      expect(guide.targets.length).toBeGreaterThan(0);
      expect(guide.targets.length).toBeLessThanOrEqual(darts);
      expect(guide.targets.reduce((sum,t)=>sum+t.score,0)+guide.leave).toBe(remaining);
      expect(guide.targets.every(t=>t.score>=1&&t.score<=60)).toBe(true);
      if(canFinishFrom(remaining,darts)){
        expect(guide.kind).toBe("finish");expect(guide.leave).toBe(0);
        const final=guide.targets.at(-1)!;
        expect(final.label.startsWith("D")||final.label==="Bull").toBe(true);
      }else{
        expect(guide.kind).toBe("setup");expect(guide.leave).toBeGreaterThanOrEqual(2);
        expect(canFinishFrom(guide.leave)).toBe(true);
      }
    }
  });
  it("never labels bogey scores as a three-dart checkout",()=>{
    for(const n of [159,162,163,165,166,168,169]){
      expect(get121CheckoutGuide(n).kind).toBe("setup");
      expect(get121CheckoutGuide(n).leave).toBe(32);
    }
  });
  it("replans a first-dart single with only two darts left",()=>{
    const miss=get121SingleMissGuide(121)!;
    expect(miss.hit.label).toBe("S20");expect(miss.remaining).toBe(101);
    expect(miss.guide.kind).toBe("finish");
    expect(miss.guide.targets.map(t=>t.label)).toEqual(["T17","Bull"]);
    const bigMiss=get121SingleMissGuide(170)!;
    expect(bigMiss.remaining).toBe(150);expect(bigMiss.guide.kind).toBe("setup");
    expect(bigMiss.guide.targets.length).toBeLessThanOrEqual(2);
    expect(get121CheckoutGuide(50,1).targets[0].label).toBe("Bull");
  });
  it("returns no plan for invalid scores or dart counts",()=>{
    for(const n of [-1,0,1,171,121.5,NaN])expect(get121CheckoutGuide(n).kind).toBe("none");
    expect(get121CheckoutGuide(121,0).kind).toBe("none");
  });
});
describe("121 progression and entry previews",()=>{
  it("keeps the current base on a later-visit finish and locks on the first",()=>{
    expect(resolve121Turn(session({current_checkout:125,remaining:125}),125)).toMatchObject({
      result:"locked",finished:true,patch:{base_checkout:125,current_checkout:126,current_turn:1,remaining:126},
    });
    expect(resolve121Turn(session({current_checkout:125,remaining:40,current_turn:2}),40)).toMatchObject({
      result:"progressed",patch:{base_checkout:121,current_checkout:126,current_turn:1,remaining:126},
    });
  });
  it("honours advance-base-on-any-finish mode",()=>{
    expect(resolve121Turn(session({current_checkout:125,remaining:40,current_turn:3,advance_base_on_any_finish:true}),40)).toMatchObject({
      result:"locked",patch:{base_checkout:125,current_checkout:126},
    });
  });
  it("uses a visit on misses and declared or calculated busts",()=>{
    expect(resolve121Turn(session(),0)).toMatchObject({isBust:false,patch:{remaining:121,current_turn:2}});
    expect(resolve121Turn(session(),121,true)).toMatchObject({isBust:true,remainingAfter:121,patch:{remaining:121,current_turn:2}});
    expect(resolve121Turn(session(),120)).toMatchObject({isBust:true,remainingAfter:121});
    expect(resolve121Turn(session(),180)).toMatchObject({isBust:true,remainingAfter:121});
    expect(resolve121Turn(session({current_checkout:159,remaining:159}),159)).toMatchObject({isBust:true,finished:false});
  });
  it("returns to the locked base after an unfinished third visit",()=>{
    expect(resolve121Turn(session({base_checkout:125,current_checkout:130,current_turn:3,remaining:60}),20)).toMatchObject({
      result:"failed",remainingAfter:40,patch:{remaining:125,current_checkout:125,current_turn:1},
    });
  });
  it("completes only by actually finishing the 170 target",()=>{
    expect(resolve121Turn(session({current_checkout:170,remaining:170}),170)).toMatchObject({result:"won",patch:{status:"won",remaining:0}});
    expect(resolve121Turn(session({current_checkout:169,remaining:40,current_turn:2}),40)).toMatchObject({result:"progressed",patch:{status:"in_progress",current_checkout:170,remaining:170}});
  });
  it("rejects invalid visit totals",()=>{
    for(const n of [-1,181,60.5,NaN])expect(()=>resolve121Turn(session(),n)).toThrow();
  });
});
