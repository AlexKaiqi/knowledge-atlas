export function parallelModel(p,s){
 if(!Number.isFinite(p)||p<0||p>1||!Number.isFinite(s)||s<1)throw new RangeError('Expected 0 ≤ p ≤ 1 and s ≥ 1');
 const serial=1-p,parallel=p/s,time=serial+parallel;return {p,s,serial,parallel,time,speedup:1/time,limit:p===1?null:1/serial};
}
export function causalModel(rain,mode='observe'){
 if(!Number.isFinite(rain)||rain<=0||rain>=1||!['observe','intervene'].includes(mode))throw new RangeError('Invalid rain proportion or comparison mode');
 const umbrellaProbability=.9*rain+.1*(1-rain);
 const rainWithUmbrella=mode==='observe'?.9*rain/umbrellaProbability:rain;
 const rainWithoutUmbrella=mode==='observe'?.1*rain/(1-umbrellaProbability):rain;
 const umbrella=.4*rainWithUmbrella+.01*(1-rainWithUmbrella);
 const without=.8*rainWithoutUmbrella+.05*(1-rainWithoutUmbrella);
 return {rain,mode,umbrella,without,rainWithUmbrella,rainWithoutUmbrella,difference:umbrella-without};
}
